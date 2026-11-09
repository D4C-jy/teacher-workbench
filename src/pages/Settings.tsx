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
}

export default function Settings() {
  const { user, logout } = useAuth()
  const [data, setData] = useState<SettingsData | null>(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState({ lowThreshold: '3', expireDays: '30', semesterStart: '' })
  const [newSlot, setNewSlot] = useState({ name: '', start: '19:00', end: '20:30' })

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
        <h3>数据</h3>
        <p className="set-desc">
          全部数据是一个 SQLite 文件。复制它就是完整备份；把它放回原位置就是还原。
        </p>
        <div className="set-path">{data.dbFile}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="pill small dark" onClick={backup} style={{ height: 32 }}>
            下载备份
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', alignSelf: 'center' }}>
            还原：关掉窗口 → 用备份文件覆盖上面这个路径 → 重新启动
          </span>
        </div>
      </section>

      {flash && <div className="st-flash">{flash}</div>}
    </div>
  )
}
