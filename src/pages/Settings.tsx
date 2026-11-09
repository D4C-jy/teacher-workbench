import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

interface Slot {
  id: number
  name: string
  start_time: string
  end_time: string
  rule_count: number
  session_count: number
}

interface SettingsData {
  slots: Slot[]
  config: { lowThreshold: number; expireDays: number; semesterStart: string }
  dbFile: string
  dataDir: string
  homeDir: string
  canPickFolder: boolean
}

export default function Settings() {
  const { user, logout } = useAuth()
  const [data, setData] = useState<SettingsData | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({ lowThreshold: '3', expireDays: '30', semesterStart: '' })
  const [newSlot, setNewSlot] = useState({ name: '', start: '19:00', end: '20:30' })
  const [showMove, setShowMove] = useState(false)
  const [movePath, setMovePath] = useState('')
  const [moving, setMoving] = useState(false)
  const [needsRestart, setNeedsRestart] = useState(false)
  const [importSummary, setImportSummary] = useState<{
    students: number
    sessions: number
    ledger: number
    equipment: number
    users: number
  } | null>(null)
  const [csvRows, setCsvRows] = useState<Array<{ name: string; className: string; courseName: string; lessons: number }>>([])
  const [importing, setImporting] = useState(false)
  const [monthly, setMonthly] = useState<{
    lessons: number
    revenue: number
    attendance: { rate: number }
    renewals: { rate: number }
  } | null>(null)

  async function load() {
    try {
      const d = await api<SettingsData>('/settings')
      setData(d)
      setForm({
        lowThreshold: String(d.config.lowThreshold),
        expireDays: String(d.config.expireDays),
        semesterStart: d.config.semesterStart ?? '',
      })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }

  useEffect(() => {
    load()
    api<{ lessons: number; revenue: number; attendance: { rate: number }; renewals: { rate: number } }>(
      '/stats/monthly'
    )
      .then(setMonthly)
      .catch(() => {})
  }, [])

  function toast(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2400)
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/settings', {
        body: {
          lowThreshold: Number(form.lowThreshold),
          expireDays: Number(form.expireDays),
          semesterStart: form.semesterStart || undefined,
        },
      })
      toast('已保存')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/slots', {
        body: { name: newSlot.name || undefined, startTime: newSlot.start, endTime: newSlot.end },
      })
      setNewSlot({ name: '', start: '19:00', end: '20:30' })
      toast('已添加时段')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeSlot(slot: Slot) {
    if (slot.rule_count + slot.session_count > 0) return toast('这个时段还有课在用')
    if (!confirm(`删除时段 ${slot.start_time}–${slot.end_time}？`)) return
    setBusy(true)
    try {
      await api(`/slots/${slot.id}`, { method: 'DELETE' })
      toast('已删除')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function doMove(e: React.FormEvent) {
    e.preventDefault()
    if (!movePath.trim()) return toast('请输入目录路径')
    setMoving(true)
    try {
      const r = await api<{ dataDir: string }>('/settings/move-data', {
        body: { targetDir: movePath.trim() },
      })
      setShowMove(false)
      toast(`已迁移到 ${r.dataDir}，请重启程序`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '迁移失败')
    } finally {
      setMoving(false)
    }
  }

  /** 有原生对话框就直接弹，没有就退回手动输入 */
  async function changeLocation() {
    if (!data?.canPickFolder) {
      setMovePath(data?.dataDir ?? '')
      setShowMove(true)
      return
    }
    setMoving(true)
    try {
      const r = await api<{ path: string | null }>('/native/pick-folder', { body: { defaultPath: data.dataDir } })
      if (!r.path) return
      const m = await api<{ dataDir: string }>('/settings/move-data', { body: { targetDir: r.path } })
      setNeedsRestart(true)
      toast(`已迁移到 ${m.dataDir}`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '迁移失败')
    } finally {
      setMoving(false)
    }
  }

  async function restartNow() {
    try {
      await api('/native/relaunch', { method: 'POST' })
    } catch {
      toast('请手动关闭并重新打开程序')
    }
  }

  /** 选择 .db 备份文件并上传（不会立刻生效，重启后替换） */
  async function onPickBackup(file: File) {
    setImporting(true)
    setImportSummary(null)
    try {
      const token = localStorage.getItem('twb.token')
      const res = await fetch('/api/import/backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '导入失败')
      setImportSummary(data.summary)
      setNeedsRestart(true)
      toast('备份已接收，重启后生效')
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  async function cancelImport() {
    try {
      await api('/import/cancel', { method: 'POST' })
      setImportSummary(null)
      setNeedsRestart(false)
      toast('已取消导入')
    } catch (err) {
      toast(err instanceof Error ? err.message : '取消失败')
    }
  }

  /** 读 CSV：姓名,班级,课程,剩余课时 */
  function onPickCsv(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '').replace(/^\ufeff/, '')
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      lines.shift() // 表头
      const rows = lines
        .map((l) => {
          const c = l.split(',').map((x) => x.trim())
          return {
            name: c[0] ?? '',
            className: c[1] ?? '',
            courseName: c[2] ?? '',
            lessons: Number(c[3] ?? 0) || 0,
          }
        })
        .filter((r) => r.name)
      setCsvRows(rows)
      if (rows.length === 0) toast('没读到有效数据，检查一下格式')
    }
    reader.readAsText(file, 'utf-8')
  }

  async function confirmCsv() {
    if (csvRows.length === 0) return
    setImporting(true)
    try {
      const r = await api<{ created: { students: number; classes: number; skipped: number }; errors: string[] }>(
        '/import/students',
        { body: { rows: csvRows } }
      )
      setCsvRows([])
      toast(`导入 ${r.created.students} 名学员，新建 ${r.created.classes} 个班${r.created.skipped ? `，跳过 ${r.created.skipped}` : ''}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  async function downloadTemplate() {
    const token = localStorage.getItem('twb.token')
    const res = await fetch('/api/export/students-template.csv', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '学员导入模板.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function backup() {
    const token = localStorage.getItem('twb.token')
    const res = await fetch('/api/backup', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) return toast('备份失败')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `教培工作台备份-${new Date().toISOString().slice(0, 10)}.db`
    a.click()
    URL.revokeObjectURL(url)
    toast('备份已下载')
  }

  if (error) return <div className="loading">{error}</div>
  if (!data) return <div className="loading">加载中…</div>

  return (
    <div className="st-wrap" style={{ flexDirection: 'column', gap: 12, overflow: 'auto' }}>
      <div className="set-grid">
        {/* 账号（横跨整行） */}
        <section className="set-card set-account">
          <div className="set-account-main">
            <h3>账号</h3>
            <p className="set-desc">本机账号，数据保存在这台电脑上，不上传。</p>
            <div className="set-user">
              <span className="st-av">
                <span style={{ fontSize: 16 }}>{(user?.displayName ?? '?').slice(0, 1)}</span>
              </span>
              <div>
                <b>{user?.displayName}</b>
                <small>@{user?.username}</small>
              </div>
              <button className="pill small" onClick={() => logout()} style={{ marginLeft: 'auto', height: 32 }}>
                退出登录
              </button>
            </div>
          </div>

          {monthly && (
            <div className="set-account-stats">
              <div>
                <b>{monthly.attendance.rate}%</b>
                <span>本月到课率</span>
              </div>
              <div>
                <b>{monthly.renewals.rate}%</b>
                <span>续费率</span>
              </div>
              <div>
                <b>{monthly.lessons}</b>
                <span>总上课课时</span>
              </div>
              <div>
                <b>¥{monthly.revenue.toLocaleString('zh-CN')}</b>
                <span>本月业绩</span>
              </div>
            </div>
          )}
        </section>

        {/* 提醒 */}
        <section className="set-card set-full">
          <h3>提醒设置</h3>
          <p className="set-desc">低于阈值的学员会在今日页和学员页标红。</p>
          <form className="set-form" onSubmit={saveConfig}>
            <label>
              课时预警阈值
              <div className="set-row">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.lowThreshold}
                  onChange={(e) => setForm({ ...form, lowThreshold: e.target.value })}
                />
                <span>节以下标红</span>
              </div>
            </label>
            <label>
              到期提醒
              <div className="set-row">
                <input
                  type="number"
                  min="0"
                  value={form.expireDays}
                  onChange={(e) => setForm({ ...form, expireDays: e.target.value })}
                />
                <span>天内到期提醒</span>
              </div>
            </label>
            <label>
              学期开始日
              <input
                type="date"
                value={form.semesterStart}
                onChange={(e) => setForm({ ...form, semesterStart: e.target.value })}
              />
            </label>
            <button className="pill small dark" type="submit" disabled={busy} style={{ height: 32, alignSelf: 'start' }}>
              保存设置
            </button>
          </form>
        </section>
      </div>

      {/* 时段 */}
      <section className="set-card">
        <h3>上课时段</h3>
        <p className="set-desc">排课时可以直接拖滑块自定义时间，新时段会自动出现在这里。</p>
        <div className="set-slots">
          {data.slots.map((s) => (
            <div className="set-slot" key={s.id}>
              <b>
                {s.start_time}–{s.end_time}
              </b>
              <span>{s.name}</span>
              <small>
                {s.rule_count > 0 ? `${s.rule_count} 条周规则 · ` : ''}
                {s.session_count} 节课
              </small>
              <button
                className="pill small"
                onClick={() => removeSlot(s)}
                disabled={busy || s.rule_count + s.session_count > 0}
                style={{ marginLeft: 'auto', height: 28 }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
        <form className="set-addrow" onSubmit={addSlot}>
          <input
            placeholder="名称（可选，如 晚间班）"
            value={newSlot.name}
            onChange={(e) => setNewSlot({ ...newSlot, name: e.target.value })}
          />
          <input
            type="time"
            value={newSlot.start}
            onChange={(e) => setNewSlot({ ...newSlot, start: e.target.value })}
          />
          <span>—</span>
          <input
            type="time"
            value={newSlot.end}
            onChange={(e) => setNewSlot({ ...newSlot, end: e.target.value })}
          />
          <button className="pill small dark" type="submit" disabled={busy} style={{ height: 32 }}>
            ＋ 添加
          </button>
        </form>
      </section>

      {/* 数据 */}
      <section className="set-card">
        <h3>数据存放位置</h3>
        <p className="set-desc">
          全部数据是一个 SQLite 文件，放在下面这个目录里。建议放非系统盘，重装系统也不丢。
        </p>
        <div className="set-path">{data.dataDir}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="pill small" onClick={changeLocation} disabled={moving} style={{ height: 32 }}>
            {moving ? '处理中…' : data.canPickFolder ? '选择新位置…' : '更改位置'}
          </button>
          {needsRestart && (
            <button className="pill small dark" onClick={restartNow} style={{ height: 32 }}>
              立即重启生效
            </button>
          )}
          <button className="pill small dark" onClick={backup} style={{ height: 32 }}>
            下载备份
          </button>
        </div>
        <p className="set-desc" style={{ marginTop: 6 }}>
          {data.canPickFolder
            ? '点「选择新位置」会弹出文件夹选择框，选完自动复制过去，重启程序后生效，原目录文件保留。'
            : '更改位置会把当前数据复制到新目录，重启程序后生效，原目录文件不会被删除。'}
        </p>
      </section>

      {showMove && (
        <div className="mask" onClick={() => setShowMove(false)}>
          <form className="dlg" style={{ width: 460 }} onClick={(e) => e.stopPropagation()} onSubmit={doMove}>
            <div className="dlg-head">
              <h3>更改数据存放位置</h3>
              <button type="button" className="tt-close" onClick={() => setShowMove(false)}>
                ×
              </button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                新目录（绝对路径）
                <input
                  value={movePath}
                  onChange={(e) => setMovePath(e.target.value)}
                  placeholder="例如 D://教培工作台数据"
                  autoFocus
                />
              </label>
            </div>
            <p className="dlg-hint">
              当前：{data.dataDir}
              <br />
              迁移会把数据库复制到新目录，原文件保留。需要关闭并重新打开程序才会生效。
            </p>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowMove(false)}>
                取消
              </button>
              <button type="submit" className="pill small dark" disabled={moving}>
                {moving ? '迁移中…' : '迁移到此处'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 导入 */}
      <section className="set-card">
        <h3>导入与还原</h3>
        <p className="set-desc">
          换电脑时：在旧电脑点「下载备份」，把得到的 .db 文件拷过来，在新电脑这里导入，数据完整还原。
        </p>

        <div className="set-import">
          <label className={`pill small dark${importing ? ' disabled' : ''}`} style={{ height: 32, cursor: 'pointer' }}>
            {importing ? '处理中…' : '导入备份文件（.db）'}
            <input
              type="file"
              accept=".db,.sqlite,.sqlite3"
              style={{ display: 'none' }}
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPickBackup(f)
                e.target.value = ''
              }}
            />
          </label>
          <button className="pill small" onClick={downloadTemplate} style={{ height: 32 }}>
            下载学员表示例
          </button>
        </div>

        {importSummary && (
          <div className="set-import-result">
            <b>备份已接收，重启程序后生效</b>
            <span>
              含 {importSummary.students} 名学员 · {importSummary.sessions} 节课次 ·{' '}
              {importSummary.ledger} 条课时流水 · {importSummary.equipment} 台器材 ·{' '}
              {importSummary.users} 个账号
            </span>
            <span style={{ color: 'var(--ink-3)' }}>
              当前数据会保留为 workbench.db.bak，确认新数据没问题后再删。
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              {data.canPickFolder && (
                <button className="pill small dark" onClick={restartNow} style={{ height: 30 }}>
                  立即重启生效
                </button>
              )}
              <button className="pill small" onClick={cancelImport} style={{ height: 30 }}>
                取消导入
              </button>
            </div>
          </div>
        )}

        <hr className="set-hr" />

        <p className="set-desc">
          也可以只导入学员名单：CSV 四列（姓名, 班级, 课程, 剩余课时），班级和课程会自动创建。
        </p>
        <div className="set-import">
          <label className="pill small" style={{ height: 32, cursor: 'pointer' }}>
            选择学员 CSV
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPickCsv(f)
                e.target.value = ''
              }}
            />
          </label>
          {csvRows.length > 0 && (
            <>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>读到 {csvRows.length} 行</span>
              <button className="pill small dark" onClick={confirmCsv} disabled={importing} style={{ height: 32 }}>
                确认导入
              </button>
              <button className="pill small" onClick={() => setCsvRows([])} style={{ height: 32 }}>
                清空
              </button>
            </>
          )}
        </div>

        {csvRows.length > 0 && (
          <div className="set-csv">
            {csvRows.slice(0, 6).map((r, i) => (
              <div key={i}>
                <b>{r.name}</b>
                <span>{r.className || '未分班'}</span>
                <span>{r.courseName || '默认课程'}</span>
                <em>{r.lessons} 节</em>
              </div>
            ))}
            {csvRows.length > 6 && <div className="set-csv-more">…还有 {csvRows.length - 6} 行</div>}
          </div>
        )}
      </section>

      {flash && <div className="st-flash">{flash}</div>}
    </div>
  )
}
