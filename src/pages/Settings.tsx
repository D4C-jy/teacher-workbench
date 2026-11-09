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
        {/* 账号 */}
        <section className="set-card">
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
        </section>

        {/* 提醒 */}
        <section className="set-card">
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

      {flash && <div className="st-flash">{flash}</div>}
    </div>
  )
}
