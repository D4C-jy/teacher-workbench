import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { db, seedIfEmpty, todayStr, tx, DB_FILE, DATA_DIR, HOME_DIR, LOCATION_FILE } from './db'
import {
  hashPassword,
  verifyPassword,
  issueToken,
  userFromToken,
  revokeToken,
  countUsers,
  type SessionUser,
} from './auth'

const PORT = Number(process.env.PORT || 4317)
const app = express()
app.use(express.json())

seedIfEmpty()

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser
    }
  }
}

function bearer(req: express.Request): string | undefined {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : undefined
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = userFromToken(bearer(req))
  if (!user) return res.status(401).json({ error: '未登录或登录已过期' })
  req.user = user
  next()
}

/* ---------------- 认证 ---------------- */

app.get('/api/auth/status', (_req, res) => {
  res.json({ hasUser: countUsers() > 0 })
})

app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName } = req.body ?? {}
  const name = String(username ?? '').trim()
  const pw = String(password ?? '')
  const display = String(displayName ?? '').trim() || name

  if (name.length < 2 || name.length > 24) return res.status(400).json({ error: '用户名需 2–24 个字符' })
  if (pw.length < 6) return res.status(400).json({ error: '密码至少 6 位' })

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(name)
  if (exists) return res.status(409).json({ error: '这个用户名已被使用' })

  const info = db
    .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
    .run(name, display, hashPassword(pw))

  const userId = Number(info.lastInsertRowid)
  res.json({
    token: issueToken(userId),
    user: { id: userId, username: name, displayName: display },
    seeded: countUsers() === 1,
  })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body ?? {}
  const row = db
    .prepare('SELECT id, username, display_name, password_hash FROM users WHERE username = ?')
    .get(String(username ?? '').trim()) as
    | { id: number; username: string; display_name: string; password_hash: string }
    | undefined

  if (!row || !verifyPassword(String(password ?? ''), row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码不正确' })
  }
  res.json({
    token: issueToken(row.id),
    user: { id: row.id, username: row.username, displayName: row.display_name },
  })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

app.post('/api/auth/logout', (req, res) => {
  revokeToken(bearer(req))
  res.json({ ok: true })
})

/* ---------------- 今日 ---------------- */

interface SessionRow {
  id: number
  slot_id: number
  class_id: number
  room: string | null
  status: string
  start_time: string
  end_time: string
  course_name: string
  class_name: string
}

interface BalanceRow {
  id: number
  name: string
  balance: number
}

function weekNumber(dateStr: string): number {
  const cfg = db.prepare('SELECT value FROM app_config WHERE key = ?').get('semester_start') as
    | { value: string }
    | undefined
  let start = cfg?.value
  if (!start) {
    const d = new Date(dateStr)
    d.setDate(d.getDate() - 7 * 10)
    start = todayStr(d)
    db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('semester_start', start)
  }
  const diff = new Date(dateStr).getTime() - new Date(start).getTime()
  return Math.max(1, Math.floor(diff / (7 * 864e5)) + 1)
}

app.get('/api/today', requireAuth, (req, res) => {
  const date = String(req.query.date || todayStr())
  const weekdayLabel = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date).getDay()]

  const sessions = db
    .prepare(
      `SELECT se.id, se.slot_id, se.class_id, se.room, se.status,
              ts.start_time, ts.end_time, c.name AS course_name, cl.name AS class_name
         FROM sessions se
         JOIN time_slots ts ON ts.id = se.slot_id
         JOIN classes cl ON cl.id = se.class_id
         JOIN courses c ON c.id = cl.course_id
        WHERE se.date = ?
        ORDER BY ts.start_time`
    )
    .all(date) as SessionRow[]

  const balances = db
    .prepare(
      `SELECT s.id, s.name, ROUND(COALESCE(SUM(l.delta), 0), 2) AS balance
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         LEFT JOIN lesson_ledger l ON l.enrollment_id = e.id
        WHERE e.status = 'active' AND s.archived = 0
        GROUP BY s.id, s.name`
    )
    .all() as BalanceRow[]

  const lowThreshold = Number(getCfg('low_threshold', '3'))
  const lowStudents = balances
    .filter((b) => b.balance <= lowThreshold)
    .sort((a, b) => a.balance - b.balance)

  // 焦点班级：第一堂未取消的课
  const focus = sessions.find((s) => s.status !== 'cancelled') ?? sessions[0]
  const classStudents = focus
    ? (db
        .prepare(
          `SELECT s.id, s.name, ROUND(COALESCE(SUM(l.delta), 0), 2) AS balance
             FROM enrollments e
             JOIN students s ON s.id = e.student_id
             LEFT JOIN lesson_ledger l ON l.enrollment_id = e.id
            WHERE e.class_id = ? AND e.status = 'active' AND s.archived = 0
            GROUP BY s.id, s.name
            ORDER BY s.name`
        )
        .all(focus.class_id) as BalanceRow[])
    : []

  const attendanceTotals = db
    .prepare(
      `SELECT se.id AS session_id, COUNT(a.student_id) AS n
         FROM sessions se LEFT JOIN attendance a ON a.session_id = se.id
        WHERE se.date = ? GROUP BY se.id`
    )
    .all(date) as Array<{ session_id: number; n: number }>
  const presentMap = new Map(attendanceTotals.map((r) => [r.session_id, r.n]))

  // 未上课的课次用报名人数作为「应到」人数
  const classCounts = new Map(
    (db.prepare("SELECT class_id, COUNT(*) AS n FROM enrollments WHERE status = 'active' GROUP BY class_id").all() as Array<{
      class_id: number
      n: number
    }>).map((r) => [r.class_id, r.n])
  )

  const equipment = db
    .prepare('SELECT id, code, model, status FROM equipment ORDER BY code')
    .all() as Array<{ id: number; code: string; model: string; status: string }>

  const lentLoans = db
    .prepare(
      `SELECT eq.code, l.borrower_name, l.due_at
         FROM equipment_loans l JOIN equipment eq ON eq.id = l.equipment_id
        WHERE l.returned_at IS NULL ORDER BY l.lent_at`
    )
    .all() as Array<{ code: string; borrower_name: string; due_at: string | null }>

  const expiring = db
    .prepare(
      `SELECT COUNT(*) AS n FROM enrollments
        WHERE status = 'active' AND expire_at IS NOT NULL
          AND date(expire_at) <= date(?, '+' || ? || ' day')`
    )
    .get(date, String(Number(getCfg('expire_days', '30')))) as { n: number }

  const activeCount = sessions.filter((s) => s.status !== 'cancelled').length
  const attendTotal = sessions
    .filter((s) => s.status === 'done')
    .reduce((sum, s) => sum + (presentMap.get(s.id) ?? 0), 0)

  res.json({
    date,
    weekday: weekdayLabel,
    week: weekNumber(date),
    focusClassId: focus?.class_id ?? null,
    sessions: sessions.map((s) => ({
      id: s.id,
      start: s.start_time,
      end: s.end_time,
      courseName: s.course_name,
      className: s.class_name,
      room: s.room,
      status: s.status,
      present: s.status === 'done' ? presentMap.get(s.id) ?? 0 : classCounts.get(s.class_id) ?? 0,
      balanceSum: 0,
    })),
    lowThreshold,
    stats: {
      sessions: activeCount,
      attendances: attendTotal,
      lowBalance: lowStudents.length,
    },
    lowStudents,
    expiring: expiring.n,
    classStudents,
    equipment: {
      total: equipment.length,
      inStock: equipment.filter((e) => e.status === 'in_stock').length,
      lent: equipment.filter((e) => e.status === 'lent').length,
      repair: equipment.filter((e) => e.status === 'repair').length,
      items: equipment,
    },
    lentLoans,
  })
})

/* ---------------- 课表 ---------------- */

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 取某天所在周的周一 */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr)
  const wd = d.getDay() // 0=周日
  const diff = wd === 0 ? -6 : 1 - wd
  d.setDate(d.getDate() + diff)
  return fmt(d)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return fmt(d)
}

interface RuleRow {
  id: number
  class_id: number
  weekday: number
  slot_id: number
  room: string | null
}

/** 按周课表规则补齐该周的课次（已存在的不动） */
function ensureWeekSessions(weekStart: string) {
  const rules = db.prepare('SELECT id, class_id, weekday, slot_id, room FROM schedule_rules').all() as RuleRow[]
  if (rules.length === 0) return

  const insert = db.prepare(
    'INSERT INTO sessions (date, rule_id, class_id, slot_id, room, status) VALUES (?, ?, ?, ?, ?, ?)'
  )

  tx(() => {
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i)
      const weekday = new Date(date).getDay()
      for (const r of rules) {
        if (r.weekday !== weekday) continue
        // 按 rule_id 判断，调课后不会在原时段重复补课
        const exists = db
          .prepare('SELECT id FROM sessions WHERE date = ? AND rule_id = ?')
          .get(date, r.id)
        if (exists) continue
        insert.run(date, r.id, r.class_id, r.slot_id, r.room, 'planned')
      }
    }
  })
}

app.get('/api/meta', requireAuth, (_req, res) => {
  res.json({
    courses: db.prepare('SELECT id, name FROM courses ORDER BY id').all(),
    classes: db
      .prepare(
        `SELECT cl.id, cl.name, cl.course_id, cl.capacity, c.name AS course_name
           FROM classes cl JOIN courses c ON c.id = cl.course_id ORDER BY cl.id`
      )
      .all(),
    slots: db.prepare('SELECT id, name, start_time, end_time FROM time_slots ORDER BY start_time').all(),
  })
})

app.get('/api/timetable', requireAuth, (req, res) => {
  const raw = String(req.query.start || '')
  const weekStart = mondayOf(raw || todayStr())
  ensureWeekSessions(weekStart)

  const slots = db
    .prepare('SELECT id, name, start_time, end_time FROM time_slots ORDER BY start_time')
    .all() as Array<{ id: number; name: string; start_time: string; end_time: string }>

  const rows = db
    .prepare(
      `SELECT se.id, se.date, se.slot_id, se.class_id, se.room, se.status,
              cl.name AS class_name, c.name AS course_name, cl.course_id
         FROM sessions se
         JOIN classes cl ON cl.id = se.class_id
         JOIN courses c ON c.id = cl.course_id
        WHERE se.date BETWEEN ? AND ?
        ORDER BY se.date`
    )
    .all(weekStart, addDays(weekStart, 6)) as Array<{
    id: number
    date: string
    slot_id: number
    class_id: number
    room: string | null
    status: string
    class_name: string
    course_name: string
    course_id: number
  }>

  const counts = new Map(
    (db
      .prepare("SELECT class_id, COUNT(*) AS n FROM enrollments WHERE status = 'active' GROUP BY class_id")
      .all() as Array<{ class_id: number; n: number }>).map((r) => [r.class_id, r.n])
  )

  const today = todayStr()
  const byDate = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, [])
    byDate.get(r.date)!.push(r)
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const list = (byDate.get(date) ?? []).map((r) => ({
      id: r.id,
      slotId: r.slot_id,
      classId: r.class_id,
      className: r.class_name,
      courseName: r.course_name,
      courseId: r.course_id,
      room: r.room,
      status: r.status,
      expected: counts.get(r.class_id) ?? 0,
    }))
    return {
      date,
      weekday: new Date(date).getDay(),
      dayNum: Number(date.slice(8, 10)),
      isToday: date === today,
      sessions: list,
    }
  })

  const startD = new Date(weekStart)
  const endD = new Date(addDays(weekStart, 6))

  res.json({
    weekStart,
    weekEnd: fmt(endD),
    label: `${startD.getMonth() + 1} 月 ${startD.getDate()} 日 — ${endD.getMonth() + 1} 月 ${endD.getDate()} 日`,
    week: weekNumber(weekStart),
    slots,
    days,
  })
})

app.post('/api/sessions/:id/status', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const status = String(req.body?.status ?? '')
  if (!['planned', 'done', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: '状态不合法' })
  }
  const info = db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, id)
  if (Number(info.changes) === 0) return res.status(404).json({ error: '课次不存在' })
  res.json({ ok: true })
})

app.post('/api/sessions/:id/move', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const slotId = Number(req.body?.slotId)
  if (!slotId) return res.status(400).json({ error: '请选择新的时段' })
  const slot = db.prepare('SELECT id FROM time_slots WHERE id = ?').get(slotId)
  if (!slot) return res.status(400).json({ error: '时段不存在' })
  const info = db.prepare('UPDATE sessions SET slot_id = ? WHERE id = ?').run(slotId, id)
  if (Number(info.changes) === 0) return res.status(404).json({ error: '课次不存在' })
  res.json({ ok: true })
})

/* ---------------- 排课 ---------------- */

/** 按开始/结束时间找或建一个时段 */
function ensureSlot(start: string, end: string): number | null {
  const re = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!re.test(start) || !re.test(end)) return null
  if (start >= end) return null
  const found = db.prepare('SELECT id FROM time_slots WHERE start_time = ? AND end_time = ?').get(start, end) as
    | { id: number }
    | undefined
  if (found) return found.id
  const info = db
    .prepare('INSERT INTO time_slots (name, start_time, end_time) VALUES (?, ?, ?)')
    .run(`${start}–${end}`, start, end)
  return Number(info.lastInsertRowid)
}

app.post('/api/schedule/rule', requireAuth, (req, res) => {
  const classId = Number(req.body?.classId)
  const weekday = Number(req.body?.weekday)
  let slotId = Number(req.body?.slotId || 0)
  const room = String(req.body?.room ?? '').trim() || null

  const startTime = String(req.body?.startTime ?? '')
  const endTime = String(req.body?.endTime ?? '')
  if (!slotId && startTime && endTime) {
    const made = ensureSlot(startTime, endTime)
    if (!made) return res.status(400).json({ error: '时间格式不对，或结束早于开始' })
    slotId = made
  }

  if (!classId || !slotId || Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
    return res.status(400).json({ error: '请选择班级、星期和时段' })
  }
  const cls = db.prepare('SELECT id FROM classes WHERE id = ?').get(classId)
  const slot = db.prepare('SELECT id FROM time_slots WHERE id = ?').get(slotId)
  if (!cls || !slot) return res.status(400).json({ error: '班级或时段不存在' })

  const dup = db
    .prepare('SELECT id FROM schedule_rules WHERE class_id = ? AND weekday = ? AND slot_id = ?')
    .get(classId, weekday, slotId)
  if (dup) return res.status(409).json({ error: '这个班在该时段已经有固定课了' })

  db.prepare('INSERT INTO schedule_rules (class_id, weekday, slot_id, room) VALUES (?, ?, ?, ?)').run(
    classId,
    weekday,
    slotId,
    room
  )
  ensureWeekSessions(mondayOf(todayStr()))
  res.json({ ok: true })
})

app.post('/api/sessions', requireAuth, (req, res) => {
  const date = String(req.body?.date ?? '').trim()
  const classId = Number(req.body?.classId)
  let slotId = Number(req.body?.slotId || 0)
  const room = String(req.body?.room ?? '').trim() || null

  const startTime = String(req.body?.startTime ?? '')
  const endTime = String(req.body?.endTime ?? '')
  if (!slotId && startTime && endTime) {
    const made = ensureSlot(startTime, endTime)
    if (!made) return res.status(400).json({ error: '时间格式不对，或结束早于开始' })
    slotId = made
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: '日期格式不对' })
  if (!classId || !slotId) return res.status(400).json({ error: '请选择班级和时段' })

  const dup = db
    .prepare('SELECT id FROM sessions WHERE date = ? AND class_id = ? AND slot_id = ?')
    .get(date, classId, slotId)
  if (dup) return res.status(409).json({ error: '这一天这个时段已经有这节课了' })

  db.prepare(
    'INSERT INTO sessions (date, class_id, slot_id, room, status) VALUES (?, ?, ?, ?, ?)'
  ).run(date, classId, slotId, room, 'planned')
  res.json({ ok: true })
})

/* ---------------- 学员与课时 ---------------- */

interface StudentRow {
  id: number
  name: string
  class_id: number
  class_name: string
  course_name: string
  enrollment_id: number
  balance: number
  expire_at: string | null
}

function listStudents(q: string, classId: number): StudentRow[] {
  const sql = `
    SELECT s.id, s.name, cl.id AS class_id, cl.name AS class_name, c.name AS course_name,
           e.id AS enrollment_id,
           ROUND(COALESCE(SUM(l.delta), 0), 2) AS balance,
           e.expire_at
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN classes cl ON cl.id = e.class_id
      JOIN courses c ON c.id = cl.course_id
      LEFT JOIN lesson_ledger l ON l.enrollment_id = e.id
     WHERE s.archived = 0
       AND (? = '' OR s.name LIKE '%' || ? || '%')
       AND (? = 0 OR cl.id = ?)
     GROUP BY e.id
     ORDER BY balance ASC, s.name`
  return db.prepare(sql).all(q, q, classId, classId) as unknown as StudentRow[]
}

app.get('/api/students', requireAuth, (req, res) => {
  const q = String(req.query.q ?? '').trim()
  const classId = Number(req.query.classId || 0)
  const rows = listStudents(q, classId)
  const threshold = Number(getCfg('low_threshold', '3'))
  res.json({
    students: rows.map((r) => ({
      id: r.id,
      name: r.name,
      classId: r.class_id,
      className: r.class_name,
      courseName: r.course_name,
      enrollmentId: r.enrollment_id,
      balance: r.balance,
      expireAt: r.expire_at,
      low: r.balance <= threshold,
    })),
    threshold,
    summary: {
      total: rows.length,
      low: rows.filter((r) => r.balance <= threshold).length,
      zero: rows.filter((r) => r.balance <= 0).length,
      sum: Math.round(rows.reduce((n, r) => n + r.balance, 0) * 100) / 100,
    },
  })
})

app.get('/api/students/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const student = db.prepare('SELECT id, name, guardian_name, guardian_phone, note FROM students WHERE id = ?').get(id) as
    | { id: number; name: string; guardian_name: string | null; guardian_phone: string | null; note: string | null }
    | undefined
  if (!student) return res.status(404).json({ error: '学员不存在' })

  const enrollments = db
    .prepare(
      `SELECT e.id, e.class_id, cl.name AS class_name, c.name AS course_name,
              ROUND(COALESCE(SUM(l.delta), 0), 2) AS balance,
              e.purchased_lessons, e.expire_at
         FROM enrollments e
         JOIN classes cl ON cl.id = e.class_id
         JOIN courses c ON c.id = cl.course_id
         LEFT JOIN lesson_ledger l ON l.enrollment_id = e.id
        WHERE e.student_id = ? AND e.status = 'active'
        GROUP BY e.id`
    )
    .all(id)

  const ledger = db
    .prepare(
      `SELECT l.id, l.type, l.delta, l.occurred_at, l.reason, l.enrollment_id,
              cl.name AS class_name
         FROM lesson_ledger l
         JOIN enrollments e ON e.id = l.enrollment_id
         JOIN classes cl ON cl.id = e.class_id
        WHERE e.student_id = ?
        ORDER BY l.occurred_at DESC, l.id DESC
        LIMIT 120`
    )
    .all(id)

  res.json({ student, enrollments, ledger })
})

app.post('/api/students/:id/recharge', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const lessons = Number(req.body?.lessons)
  const note = String(req.body?.note ?? '').trim() || '充值'
  const amount = req.body?.amount === undefined || req.body?.amount === '' ? null : Number(req.body.amount)
  const expireAt = req.body?.expireAt ? String(req.body.expireAt) : null
  const enrollmentId = Number(req.body?.enrollmentId || 0)

  if (!Number.isFinite(lessons) || lessons <= 0) {
    return res.status(400).json({ error: '充值课时必须大于 0' })
  }

  const enr = enrollmentId
    ? (db.prepare('SELECT id FROM enrollments WHERE id = ? AND student_id = ?').get(enrollmentId, id) as
        | { id: number }
        | undefined)
    : (db.prepare("SELECT id FROM enrollments WHERE student_id = ? AND status = 'active' ORDER BY id LIMIT 1").get(id) as
        | { id: number }
        | undefined)
  if (!enr) return res.status(404).json({ error: '这个学员还没有课时包' })

  tx(() => {
    db.prepare(
      "INSERT INTO lesson_ledger (enrollment_id, type, delta, occurred_at, reason, amount) VALUES (?, 'charge', ?, datetime('now','localtime'), ?, ?)"
    ).run(enr.id, lessons, note, amount)
    if (expireAt) {
      db.prepare('UPDATE enrollments SET expire_at = ? WHERE id = ?').run(expireAt, enr.id)
    }
  })

  res.json({ ok: true })
})

app.post('/api/lessons/consume', requireAuth, (req, res) => {
  const sessionId = Number(req.body?.sessionId)
  const studentIds: number[] = Array.isArray(req.body?.studentIds)
    ? req.body.studentIds.map((n: unknown) => Number(n)).filter((n: number) => n > 0)
    : []
  const per = Number(req.body?.lessons ?? 1) || 1

  if (!sessionId || studentIds.length === 0) {
    return res.status(400).json({ error: '请选择课次和到场学员' })
  }

  const session = db.prepare('SELECT id, date, class_id, status FROM sessions WHERE id = ?').get(sessionId) as
    | { id: number; date: string; class_id: number; status: string }
    | undefined
  if (!session) return res.status(404).json({ error: '课次不存在' })
  if (session.status === 'cancelled') return res.status(400).json({ error: '这节课已停课，不能消课' })

  const done: number[] = []
  const skipped: string[] = []

  tx(() => {
    for (const sid of studentIds) {
      const enr = db
        .prepare("SELECT id FROM enrollments WHERE student_id = ? AND class_id = ? AND status = 'active' LIMIT 1")
        .get(sid, session.class_id) as { id: number } | undefined
      if (!enr) {
        skipped.push(`学员 ${sid} 不在这个班`)
        continue
      }
      const dup = db
        .prepare("SELECT id FROM lesson_ledger WHERE enrollment_id = ? AND session_id = ? AND type = 'consume'")
        .get(enr.id, sessionId)
      if (dup) {
        skipped.push(`学员 ${sid} 这节课已扣过`)
        continue
      }
      db.prepare(
        "INSERT INTO lesson_ledger (enrollment_id, type, delta, session_id, occurred_at, reason) VALUES (?, 'consume', ?, ?, ?, ?)"
      ).run(enr.id, -per, sessionId, `${session.date} 消课`, `课次 #${sessionId}`)
      db.prepare('INSERT OR REPLACE INTO attendance (session_id, student_id, state, lessons) VALUES (?, ?, ?, ?)').run(
        sessionId,
        sid,
        'present',
        per
      )
      done.push(sid)
    }
    db.prepare("UPDATE sessions SET status = 'done' WHERE id = ?").run(sessionId)
  })

  res.json({ ok: true, consumed: done.length, skipped })
})

app.get('/api/export/students.csv', requireAuth, (_req, res) => {
  const rows = listStudents('', 0)
  const head = '姓名,班级,课程,剩余课时,到期日\n'
  const body = rows
    .map((r) => [r.name, r.class_name, r.course_name, r.balance, r.expire_at ?? ''].join(','))
    .join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="students.csv"')
  res.send('\ufeff' + head + body)
})

/* ---------------- 个人中心 / 月度统计 ---------------- */

function pct(n: number, d: number): number {
  if (!d) return 0
  return Math.round((n / d) * 1000) / 10
}

app.get('/api/stats/monthly', requireAuth, (req, res) => {
  const month = String(req.query.month || todayStr().slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: '月份格式应为 YYYY-MM' })
  const like = `${month}%`

  const consumed = (
    db
      .prepare("SELECT COALESCE(SUM(-delta), 0) AS v FROM lesson_ledger WHERE type = 'consume' AND occurred_at LIKE ?")
      .get(like) as { v: number }
  ).v

  const revenue = (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS v FROM lesson_ledger WHERE type = 'charge' AND occurred_at LIKE ?")
      .get(like) as { v: number }
  ).v

  const doneSessions = (
    db
      .prepare("SELECT COUNT(*) AS n FROM sessions WHERE status = 'done' AND date LIKE ?")
      .get(like) as { n: number }
  ).n

  const present = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM attendance a JOIN sessions s ON s.id = a.session_id WHERE s.status = 'done' AND s.date LIKE ?"
      )
      .get(like) as { n: number }
  ).n

  const expected = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions s
           JOIN enrollments e ON e.class_id = s.class_id AND e.status = 'active'
          WHERE s.status = 'done' AND s.date LIKE ?`
      )
      .get(like) as { n: number }
  ).n

  const activeStudents = (
    db.prepare("SELECT COUNT(DISTINCT student_id) AS n FROM enrollments WHERE status = 'active'").get() as { n: number }
  ).n

  const renewedStudents = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT e.student_id) AS n FROM lesson_ledger l
           JOIN enrollments e ON e.id = l.enrollment_id
          WHERE l.type = 'charge' AND l.occurred_at LIKE ?`
      )
      .get(like) as { n: number }
  ).n

  const daily = db
    .prepare(
      `SELECT substr(occurred_at, 1, 10) AS d, COALESCE(SUM(-delta), 0) AS v
         FROM lesson_ledger WHERE type = 'consume' AND occurred_at LIKE ?
        GROUP BY d ORDER BY d`
    )
    .all(like) as Array<{ d: string; v: number }>

  res.json({
    month,
    lessons: Math.round(consumed * 10) / 10,
    revenue: Math.round(revenue * 100) / 100,
    sessions: doneSessions,
    attendance: { present, expected, rate: pct(present, expected) },
    renewals: { renewed: renewedStudents, total: activeStudents, rate: pct(renewedStudents, activeStudents) },
    daily,
  })
})

/* ---------------- 器材 ---------------- */

interface EqRow {
  id: number
  code: string
  model: string | null
  status: string
  note: string | null
  purchased_at: string | null
}

app.get('/api/equipment', requireAuth, (_req, res) => {
  const items = db
    .prepare('SELECT id, code, model, status, note, purchased_at FROM equipment ORDER BY code')
    .all() as unknown as EqRow[]

  const openLoans = db
    .prepare(
      `SELECT l.equipment_id, l.borrower_name, l.lent_at, l.due_at, l.condition_out, l.note
         FROM equipment_loans l WHERE l.returned_at IS NULL`
    )
    .all() as Array<{
    equipment_id: number
    borrower_name: string
    lent_at: string
    due_at: string | null
    condition_out: string | null
    note: string | null
  }>
  const loanMap = new Map(openLoans.map((l) => [l.equipment_id, l]))

  res.json({
    items: items.map((e) => {
      const loan = loanMap.get(e.id)
      return {
        id: e.id,
        code: e.code,
        model: e.model,
        status: e.status,
        note: e.note,
        purchasedAt: e.purchased_at,
        loan: loan
          ? {
              borrower: loan.borrower_name,
              lentAt: loan.lent_at,
              dueAt: loan.due_at,
              conditionOut: loan.condition_out,
              purpose: loan.note,
            }
          : null,
      }
    }),
    summary: {
      total: items.length,
      inStock: items.filter((e) => e.status === 'in_stock').length,
      lent: items.filter((e) => e.status === 'lent').length,
      repair: items.filter((e) => e.status === 'repair').length,
      retired: items.filter((e) => e.status === 'retired').length,
    },
  })
})

app.post('/api/equipment', requireAuth, (req, res) => {
  const code = String(req.body?.code ?? '').trim()
  const model = String(req.body?.model ?? '').trim() || null
  if (code.length < 2) return res.status(400).json({ error: '编号至少 2 个字符' })

  const dup = db.prepare('SELECT id FROM equipment WHERE code = ?').get(code)
  if (dup) return res.status(409).json({ error: '这个编号已经存在' })

  const info = db
    .prepare("INSERT INTO equipment (code, model, status) VALUES (?, ?, 'in_stock')")
    .run(code, model)
  res.json({ ok: true, id: Number(info.lastInsertRowid) })
})

app.post('/api/equipment/:id/lend', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const borrower = String(req.body?.borrowerName ?? '').trim()
  const purpose = String(req.body?.purpose ?? '').trim() || null
  const dueAt = req.body?.dueAt ? String(req.body.dueAt) : null
  const conditionOut = String(req.body?.conditionOut ?? '').trim() || null

  if (!borrower) return res.status(400).json({ error: '请填取用人' })

  const eq = db.prepare('SELECT id, status FROM equipment WHERE id = ?').get(id) as
    | { id: number; status: string }
    | undefined
  if (!eq) return res.status(404).json({ error: '器材不存在' })
  if (eq.status === 'lent') return res.status(409).json({ error: '这台已经借出了' })
  if (eq.status === 'retired') return res.status(409).json({ error: '这台已停用' })

  tx(() => {
    db.prepare(
      "INSERT INTO equipment_loans (equipment_id, borrower_name, lent_at, due_at, condition_out, note) VALUES (?, ?, datetime('now','localtime'), ?, ?, ?)"
    ).run(id, borrower, dueAt, conditionOut, purpose)
    db.prepare("UPDATE equipment SET status = 'lent' WHERE id = ?").run(id)
  })

  res.json({ ok: true })
})

app.post('/api/equipment/:id/return', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const conditionIn = String(req.body?.conditionIn ?? '').trim() || null
  const toRepair = Boolean(req.body?.toRepair)

  const eq = db.prepare('SELECT id, status FROM equipment WHERE id = ?').get(id) as
    | { id: number; status: string }
    | undefined
  if (!eq) return res.status(404).json({ error: '器材不存在' })
  if (eq.status !== 'lent') return res.status(409).json({ error: '这台没有借出记录' })

  const open = db
    .prepare('SELECT id FROM equipment_loans WHERE equipment_id = ? AND returned_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(id) as { id: number } | undefined
  if (!open) return res.status(409).json({ error: '找不到未归还的记录' })

  tx(() => {
    db.prepare(
      "UPDATE equipment_loans SET returned_at = datetime('now','localtime'), condition_in = ? WHERE id = ?"
    ).run(conditionIn, open.id)
    db.prepare("UPDATE equipment SET status = ? WHERE id = ?").run(toRepair ? 'repair' : 'in_stock', id)
  })

  res.json({ ok: true })
})

app.get('/api/equipment/:id/loans', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const rows = db
    .prepare(
      `SELECT id, borrower_name, lent_at, due_at, returned_at, condition_out, condition_in, note
         FROM equipment_loans WHERE equipment_id = ? ORDER BY lent_at DESC, id DESC LIMIT 50`
    )
    .all(id)
  res.json({ loans: rows })
})

app.get('/api/export/equipment.csv', requireAuth, (_req, res) => {
  const items = db
    .prepare('SELECT code, model, status, note, purchased_at FROM equipment ORDER BY code')
    .all() as Array<{ code: string; model: string | null; status: string; note: string | null; purchased_at: string | null }>
  const label: Record<string, string> = { in_stock: '在库', lent: '借出', repair: '维修', retired: '停用' }
  const head = '编号,型号,状态,备注,购入日期\n'
  const body = items
    .map((e) => [e.code, e.model ?? '', label[e.status] ?? e.status, e.note ?? '', e.purchased_at ?? ''].join(','))
    .join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="equipment.csv"')
  res.send('\ufeff' + head + body)
})

/* ---------------- 设置 ---------------- */

function getCfg(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? fallback
}

app.get('/api/settings', requireAuth, (_req, res) => {
  const slots = db
    .prepare(
      `SELECT ts.id, ts.name, ts.start_time, ts.end_time,
              (SELECT COUNT(*) FROM schedule_rules r WHERE r.slot_id = ts.id) AS rule_count,
              (SELECT COUNT(*) FROM sessions se WHERE se.slot_id = ts.id) AS session_count
         FROM time_slots ts ORDER BY ts.start_time`
    )
    .all()

  res.json({
    slots,
    config: {
      lowThreshold: Number(getCfg('low_threshold', '3')),
      expireDays: Number(getCfg('expire_days', '30')),
      semesterStart: getCfg('semester_start', ''),
    },
    dbFile: DB_FILE,
    dataDir: DATA_DIR,
    homeDir: HOME_DIR,
    canPickFolder: Boolean(nativeApi()?.pickFolder),
  })
})

/** 迁移数据目录：VACUUM INTO 新位置 + 记录到 location.json，重启后生效 */
app.post('/api/settings/move-data', requireAuth, (req, res) => {
  const raw = String(req.body?.targetDir ?? '').trim()
  if (!raw) return res.status(400).json({ error: '请输入目录路径' })
  if (!/^[a-zA-Z]:[\\/]/.test(raw)) return res.status(400).json({ error: '请填绝对路径，例如 D:////教培数据' })

  const target = path.resolve(raw)
  if (target === path.resolve(DATA_DIR)) return res.status(400).json({ error: '和当前位置相同' })

  try {
    fs.mkdirSync(target, { recursive: true })
    const targetDb = path.join(target, 'workbench.db')
    if (fs.existsSync(targetDb)) {
      return res.status(409).json({ error: '这个目录里已经有 workbench.db 了，换个目录或先移走' })
    }
    db.exec(`VACUUM INTO '${targetDb.replace(/\\/g, '/')}'`)
    fs.writeFileSync(LOCATION_FILE, JSON.stringify({ dataDir: target }, null, 2), 'utf8')
    res.json({ ok: true, dataDir: target })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '迁移失败，检查目录权限或磁盘空间' })
  }
})

app.post('/api/settings', requireAuth, (req, res) => {
  const low = Number(req.body?.lowThreshold)
  const days = Number(req.body?.expireDays)
  if (!Number.isFinite(low) || low < 0) return res.status(400).json({ error: '预警阈值不合法' })
  if (!Number.isFinite(days) || days < 0) return res.status(400).json({ error: '到期提醒天数不合法' })

  tx(() => {
    db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('low_threshold', String(low))
    db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('expire_days', String(days))
    if (req.body?.semesterStart) {
      db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run(
        'semester_start',
        String(req.body.semesterStart)
      )
    }
  })
  res.json({ ok: true })
})

app.post('/api/slots', requireAuth, (req, res) => {
  const start = String(req.body?.startTime ?? '')
  const end = String(req.body?.endTime ?? '')
  const name = String(req.body?.name ?? '').trim()
  const id = ensureSlot(start, end)
  if (!id) return res.status(400).json({ error: '时间格式不对，或结束早于开始' })
  if (name) db.prepare('UPDATE time_slots SET name = ? WHERE id = ?').run(name, id)
  res.json({ ok: true, id })
})

app.delete('/api/slots/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const used = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM schedule_rules WHERE slot_id = ?) +
              (SELECT COUNT(*) FROM sessions WHERE slot_id = ?) AS n`
    )
    .get(id, id) as { n: number }
  if (used.n > 0) return res.status(409).json({ error: '这个时段还有课在用，先调整课表' })
  const info = db.prepare('DELETE FROM time_slots WHERE id = ?').run(id)
  if (Number(info.changes) === 0) return res.status(404).json({ error: '时段不存在' })
  res.json({ ok: true })
})

app.get('/api/backup', requireAuth, (_req, res) => {
  const stamp = todayStr().replace(/-/g, '')
  const tmp = path.join(path.dirname(DB_FILE), `backup-${stamp}.db`)
  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    db.exec(`VACUUM INTO '${tmp.replace(/\\/g, '/')}'`)
    res.download(tmp, `教培工作台备份-${stamp}.db`, (err) => {
      if (!err && fs.existsSync(tmp)) fs.unlinkSync(tmp)
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '备份失败' })
  }
})

/* ---------------- 原生能力桥（仅 Electron 存在） ---------------- */

function nativeApi(): any {
  return (globalThis as any).__twbNative
}

app.post('/api/native/pick-folder', async (req, res) => {
  const api = nativeApi()
  if (!api?.pickFolder) return res.status(501).json({ error: '当前环境不支持系统对话框' })
  try {
    const picked = await api.pickFolder(String(req.body?.defaultPath ?? ''))
    res.json({ path: picked })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '打开选择框失败' })
  }
})

app.post('/api/native/relaunch', (_req, res) => {
  const api = nativeApi()
  if (!api?.relaunch) return res.status(501).json({ error: '当前环境不支持自动重启' })
  res.json({ ok: true })
  setTimeout(() => api.relaunch(), 300)
})

/* ---------------- 首次启动引导 ---------------- */

app.get('/api/onboard-state', (_req, res) => {
  res.json({
    onboarded: getCfg('onboarded', '0') === '1',
    hasUser: countUsers() > 0,
    dataDir: DATA_DIR,
    defaultDataDir: path.join(HOME_DIR, 'data'),
    canPickFolder: Boolean(nativeApi()?.pickFolder),
  })
})

app.post('/api/onboard-complete', (_req, res) => {
  db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').run('onboarded', '1')
  res.json({ ok: true })
})

/** 清空演示数据，保留账号与配置 */
app.post('/api/settings/clear-data', requireAuth, (_req, res) => {
  tx(() => {
    db.exec(`
      DELETE FROM attendance;
      DELETE FROM lesson_ledger;
      DELETE FROM equipment_loans;
      DELETE FROM sessions;
      DELETE FROM schedule_rules;
      DELETE FROM schedule_overrides;
      DELETE FROM enrollments;
      DELETE FROM students;
      DELETE FROM classes;
      DELETE FROM courses;
      DELETE FROM time_slots;
      DELETE FROM equipment;
    `)
  })
  res.json({ ok: true })
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

/* ---------------- 静态资源（生产/Electron） ---------------- */

const distDir = process.env.TWB_DIST_DIR || path.resolve(process.cwd(), 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: '服务器出错了' })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
})
