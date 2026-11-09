import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

const dataDir = process.env.TWB_DATA_DIR || path.resolve(process.cwd(), 'data')
fs.mkdirSync(dataDir, { recursive: true })

export const DB_FILE = path.join(dataDir, 'workbench.db')
export const db = new DatabaseSync(DB_FILE)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  default_minutes INTEGER NOT NULL DEFAULT 90,
  note            TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  name      TEXT NOT NULL,
  capacity  INTEGER NOT NULL DEFAULT 12,
  note      TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  guardian_name  TEXT,
  guardian_phone TEXT,
  note           TEXT,
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS enrollments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id          INTEGER NOT NULL REFERENCES classes(id),
  course_id         INTEGER NOT NULL REFERENCES courses(id),
  purchased_lessons REAL NOT NULL DEFAULT 0,
  bonus_lessons     REAL NOT NULL DEFAULT 0,
  unit_price        REAL,
  purchased_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expire_at         TEXT,
  status            TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS lesson_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  delta         REAL NOT NULL,
  session_id    INTEGER,
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  reason        TEXT,
  amount        REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS time_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id       INTEGER NOT NULL REFERENCES classes(id),
  weekday        INTEGER NOT NULL,
  slot_id        INTEGER NOT NULL REFERENCES time_slots(id),
  room           TEXT,
  effective_from TEXT,
  effective_to   TEXT
);

CREATE TABLE IF NOT EXISTS schedule_overrides (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  rule_id     INTEGER REFERENCES schedule_rules(id),
  action      TEXT NOT NULL,
  new_slot_id INTEGER REFERENCES time_slots(id),
  new_room    TEXT,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  date     TEXT NOT NULL,
  rule_id  INTEGER,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  slot_id  INTEGER NOT NULL REFERENCES time_slots(id),
  room     TEXT,
  status   TEXT NOT NULL DEFAULT 'planned',
  note     TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  state      TEXT NOT NULL DEFAULT 'present',
  lessons    REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS equipment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  model        TEXT,
  status       TEXT NOT NULL DEFAULT 'in_stock',
  purchased_at TEXT,
  note         TEXT
);

CREATE TABLE IF NOT EXISTS equipment_loans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id   INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  borrower_name  TEXT NOT NULL,
  student_id     INTEGER REFERENCES students(id),
  session_id     INTEGER REFERENCES sessions(id),
  lent_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  due_at         TEXT,
  returned_at    TEXT,
  condition_out  TEXT,
  condition_in   TEXT,
  note           TEXT
);

CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_enrollment ON lesson_ledger(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_rules_class ON schedule_rules(class_id);
`)

/* ---- 轻量迁移：课次追源到规则 ---- */
{
  const cols = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'rule_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN rule_id INTEGER')
  }
  // 充值金额（业绩统计用）
  const lcols = db.prepare('PRAGMA table_info(lesson_ledger)').all() as Array<{ name: string }>
  if (!lcols.some((c) => c.name === 'amount')) {
    db.exec('ALTER TABLE lesson_ledger ADD COLUMN amount REAL')
  }
  db.exec(`
    UPDATE sessions SET rule_id = (
      SELECT r.id FROM schedule_rules r
       WHERE r.class_id = sessions.class_id
         AND r.slot_id = sessions.slot_id
         AND r.weekday = CAST(strftime('%w', sessions.date) AS INTEGER)
       LIMIT 1)
     WHERE rule_id IS NULL
  `)
  db.exec(`
    DELETE FROM sessions WHERE rule_id IS NOT NULL AND id NOT IN (
      SELECT MIN(id) FROM sessions WHERE rule_id IS NOT NULL GROUP BY date, rule_id)
  `)
}

type SqlValue = string | number | null

export function run(sql: string, ...args: SqlValue[]): number {
  const r = db.prepare(sql).run(...args)
  return Number(r.lastInsertRowid)
}

export function get<T = Record<string, unknown>>(sql: string, ...args: SqlValue[]): T | undefined {
  return db.prepare(sql).get(...args) as T | undefined
}

export function all<T = Record<string, unknown>>(sql: string, ...args: SqlValue[]): T[] {
  return db.prepare(sql).all(...args) as T[]
}

/** node:sqlite 没有内置事务包装，这里手动 BEGIN/COMMIT */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** 余额 = 流水求和（唯一真源） */
export function balanceOf(enrollmentId: number): number {
  const row = get<{ v: number }>(
    'SELECT COALESCE(SUM(delta), 0) AS v FROM lesson_ledger WHERE enrollment_id = ?',
    enrollmentId
  )
  return Math.round((row?.v ?? 0) * 100) / 100
}

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 首次启动写入演示数据，保证一登录就有东西看 */
export function seedIfEmpty() {
  if ((get<{ n: number }>('SELECT COUNT(*) AS n FROM students')?.n ?? 0) > 0) return

  const today = todayStr()

  tx(() => {
    const cDrone = run('INSERT INTO courses (name, default_minutes, note) VALUES (?, ?, ?)', '无人机编程', 90, '入门到竞赛')
    const cBlock = run('INSERT INTO courses (name, default_minutes, note) VALUES (?, ?, ?)', '图形化编程', 90, 'Scratch / 图形化')
    const cPy = run('INSERT INTO courses (name, default_minutes, note) VALUES (?, ?, ?)', 'Python 进阶', 90, '语法与项目')

    const clA = run('INSERT INTO classes (course_id, name, capacity) VALUES (?, ?, ?)', cDrone, '无人机 A 班', 9)
    const clB = run('INSERT INTO classes (course_id, name, capacity) VALUES (?, ?, ?)', cBlock, '图形化 B 班', 12)
    const clC = run('INSERT INTO classes (course_id, name, capacity) VALUES (?, ?, ?)', cPy, 'Python A 班', 12)

    const s1 = run('INSERT INTO time_slots (name, start_time, end_time) VALUES (?, ?, ?)', '第一节', '09:00', '10:30')
    const s2 = run('INSERT INTO time_slots (name, start_time, end_time) VALUES (?, ?, ?)', '第二节', '14:00', '15:30')
    const s3 = run('INSERT INTO time_slots (name, start_time, end_time) VALUES (?, ?, ?)', '第三节', '18:30', '20:00')

    // 每个班每周两次：一次在今天，一次在周末（教培常见排法）
    const wd = new Date(today).getDay()
    const rA = run('INSERT INTO schedule_rules (class_id, weekday, slot_id, room) VALUES (?, ?, ?, ?)', clA, wd, s1, '302')
    run('INSERT INTO schedule_rules (class_id, weekday, slot_id, room) VALUES (?, ?, ?, ?)', clA, 6, s1, '302')
    const rB = run('INSERT INTO schedule_rules (class_id, weekday, slot_id, room) VALUES (?, ?, ?, ?)', clB, wd, s2, '305')
    run('INSERT INTO schedule_rules (class_id, weekday, slot_id, room) VALUES (?, ?, ?, ?)', clB, 0, s2, '305')
    const rC = run('INSERT INTO schedule_rules (class_id, weekday, slot_id, room) VALUES (?, ?, ?, ?)', clC, wd, s3, '301')

    const roster: Array<[string, number, number, number]> = [
      ['李明', 8, 12, clA],
      ['张一诺', 2, 8, clA],
      ['陈可', 12, 12, clA],
      ['周子墨', 6, 6, clA],
      ['吴桐', 9, 1, clA],
      ['徐若', 3, 5, clA],
      ['王一诺', 15, 5, clA],
      ['赵星', 1, 7, clA],
      ['孙沐', 10, 2, clB],
      ['何舟', 7, 3, clB],
      ['林一', 4, 4, clB],
      ['苏禾', 11, 1, clB],
    ]

    for (const [name, remain, used, classId] of roster) {
      const sid = run('INSERT INTO students (name, guardian_phone) VALUES (?, ?)', name, '138****0000')
      const courseId = classId === clA ? cDrone : classId === clB ? cBlock : cPy
      const eid = run(
        'INSERT INTO enrollments (student_id, class_id, course_id, purchased_lessons, bonus_lessons, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
        sid, classId, courseId, remain + used, 0, 120
      )
      // 先记充值，再记已消耗，余额 = 两者相加
      run(
        'INSERT INTO lesson_ledger (enrollment_id, type, delta, occurred_at, reason) VALUES (?, ?, ?, ?, ?)',
        eid, 'charge', remain + used, `${today} 00:00`, '报名缴费（演示数据）'
      )
      if (used > 0) {
        run(
          'INSERT INTO lesson_ledger (enrollment_id, type, delta, occurred_at, reason) VALUES (?, ?, ?, ?, ?)',
          eid, 'consume', -used, today, '历史消课（演示数据）'
        )
      }
    }

    run('INSERT INTO equipment (code, model, status, note) VALUES (?, ?, ?, ?)', 'UAV-001', 'DJI Mini 4K', 'in_stock', null)
    run('INSERT INTO equipment (code, model, status, note) VALUES (?, ?, ?, ?)', 'UAV-002', 'DJI Mini 4K', 'in_stock', null)
    run('INSERT INTO equipment (code, model, status, note) VALUES (?, ?, ?, ?)', 'UAV-003', 'DJI Mini 4K', 'in_stock', null)
    const eq4 = run('INSERT INTO equipment (code, model, status, note) VALUES (?, ?, ?, ?)', 'UAV-004', 'DJI Mini 4K', 'lent', null)
    run('INSERT INTO equipment (code, model, status, note) VALUES (?, ?, ?, ?)', 'UAV-005', 'Tello EDU', 'repair', '桨叶待更换')

    const ses1 = run(
      'INSERT INTO sessions (date, rule_id, class_id, slot_id, room, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      today, rA, clA, s1, '302', 'done', null
    )
    run(
      'INSERT INTO sessions (date, rule_id, class_id, slot_id, room, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      today, rB, clB, s2, '305', 'planned', null
    )
    run(
      'INSERT INTO sessions (date, rule_id, class_id, slot_id, room, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      today, rC, clC, s3, '301', 'cancelled', '已调至次日'
    )

    for (const st of all<{ student_id: number }>('SELECT student_id FROM enrollments WHERE class_id = ?', clA)) {
      run('INSERT INTO attendance (session_id, student_id, state, lessons) VALUES (?, ?, ?, ?)', ses1, st.student_id, 'present', 1)
    }

    const liming = get<{ id: number }>('SELECT id FROM students WHERE name = ?', '李明')
    run(
      'INSERT INTO equipment_loans (equipment_id, borrower_name, student_id, lent_at, due_at, condition_out) VALUES (?, ?, ?, ?, ?, ?)',
      eq4, '李明', liming?.id ?? null, `${today} 08:50`, `${today} 10:30`, '正常'
    )

    run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'seeded_at', today)
  })

  console.log('[db] 演示数据已写入')
}
