import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 数据目录解析顺序：
 * 1. 环境变量 TWB_DATA_DIR（开发/调试用）
 * 2. <home>/location.json 里记录的 dataDir（用户在设置里选过）
 * 3. <home>/data
 * home 在安装版是 %APPDATA%/教培工作台，开发版是项目根目录
 */
export const HOME_DIR = process.env.TWB_HOME || path.resolve(process.cwd())
export const LOCATION_FILE = path.join(HOME_DIR, 'location.json')

function resolveDataDir(): string {
  const fromEnv = process.env.TWB_DATA_DIR
  if (fromEnv) return fromEnv
  try {
    if (fs.existsSync(LOCATION_FILE)) {
      const j = JSON.parse(fs.readFileSync(LOCATION_FILE, 'utf8')) as { dataDir?: string }
      if (j?.dataDir && typeof j.dataDir === 'string') return j.dataDir
    }
  } catch {
    /* 配置坏了就用默认 */
  }
  return path.join(HOME_DIR, 'data')
}

export const DATA_DIR = resolveDataDir()
fs.mkdirSync(DATA_DIR, { recursive: true })

export const DB_FILE = path.join(DATA_DIR, 'workbench.db')
export const PENDING_IMPORT_FILE = path.join(DATA_DIR, 'import-pending.db')

/**
 * 导入备份是「下次启动生效」：
 * 上传的库先存成 import-pending.db，这里在打开连接前替换掉正式库，
 * 旧库留一份 workbench.db.bak 以便反悔。
 */
function applyPendingImport() {
  if (!fs.existsSync(PENDING_IMPORT_FILE)) return
  try {
    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`)
    }
    for (const ext of ['-wal', '-shm']) {
      try {
        fs.unlinkSync(DB_FILE + ext)
      } catch {
        /* 文件可能不存在或被占用，忽略 */
      }
    }
    fs.copyFileSync(PENDING_IMPORT_FILE, DB_FILE)
    try {
      fs.unlinkSync(PENDING_IMPORT_FILE)
    } catch {
      /* 删不掉也无妨，下次启动会再覆盖一遍 */
    }
    console.log('[db] 已应用导入的备份，原库备份为 workbench.db.bak')
  } catch (e) {
    console.error('[db] 应用导入备份失败', e)
  }
}

applyPendingImport()

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
  gender         TEXT,
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
  // 学员性别
  const scols = db.prepare('PRAGMA table_info(students)').all() as Array<{ name: string }>
  if (!scols.some((c) => c.name === 'gender')) {
    db.exec('ALTER TABLE students ADD COLUMN gender TEXT')
  }
  // 演示数据的报名缴费改到 2 个月前（避免污染本月续费统计）
  db.exec(`
    UPDATE lesson_ledger SET occurred_at = date('now','localtime','-2 month')
     WHERE type = 'charge' AND reason = '报名缴费（演示数据）'
       AND occurred_at LIKE date('now','localtime') || '%'
  `)
  // 补充课程
  for (const cn of ['C++', '机械臂', 'XRmaker', '3D 打印']) {
    const has = db.prepare('SELECT id FROM courses WHERE name = ?').get(cn)
    if (!has) db.prepare('INSERT INTO courses (name, default_minutes) VALUES (?, 90)').run(cn)
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
    // 其余课程（迁移时也会按名字补，见下方）
    run("INSERT INTO courses (name, default_minutes, note) VALUES ('C++', 90, '信息学竞赛')")
    run("INSERT INTO courses (name, default_minutes, note) VALUES ('机械臂', 90, '机器人')")
    run("INSERT INTO courses (name, default_minutes, note) VALUES ('XRmaker', 90, 'XR 创作')")
    run("INSERT INTO courses (name, default_minutes, note) VALUES ('3D 打印', 90, '建模与打印')")

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
      // 报名缴费放在 2 个月前，避免被算进「本月续费」
      run(
        "INSERT INTO lesson_ledger (enrollment_id, type, delta, occurred_at, reason) VALUES (?, ?, ?, date('now','localtime','-2 month'), ?)",
        eid, 'charge', remain + used, '报名缴费（演示数据）'
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

    // 器材是老师/机构取用，不挂学生
    run(
      'INSERT INTO equipment_loans (equipment_id, borrower_name, lent_at, due_at, condition_out, note) VALUES (?, ?, ?, ?, ?, ?)',
      eq4, '王老师', `${today} 08:50`, `${today} 10:30`, '正常', '上课'
    )

    run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', 'seeded_at', today)
  })

  console.log('[db] 演示数据已写入')
}
