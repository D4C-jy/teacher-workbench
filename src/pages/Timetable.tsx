import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

interface Slot {
  id: number
  name: string
  start_time: string
  end_time: string
}

interface TSession {
  id: number
  slotId: number
  classId: number
  className: string
  courseName: string
  courseId: number
  room: string | null
  status: 'planned' | 'done' | 'cancelled'
  expected: number
}

interface Day {
  date: string
  weekday: number
  dayNum: number
  isToday: boolean
  sessions: TSession[]
}

interface TimetableData {
  weekStart: string
  weekEnd: string
  label: string
  week: number
  slots: Slot[]
  days: Day[]
}

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const T_MIN = 7 * 60
const T_MAX = 22 * 60
const T_STEP = 15
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const TONE = ['blue', 'green', 'cream', 'pink', 'gray']

function shift(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Timetable() {
  const [data, setData] = useState<TimetableData | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<TSession | null>(null)
  const [moveTo, setMoveTo] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [meta, setMeta] = useState<{ classes: Array<{ id: number; name: string; course_name: string }> } | null>(null)
  const [showPlan, setShowPlan] = useState(false)
  const [planMode, setPlanMode] = useState<'weekly' | 'once'>('weekly')
  const [form, setForm] = useState({ classId: '', weekday: '', date: '', slotId: '', room: '' })
  const [showConsume, setShowConsume] = useState(false)
  const [consumeList, setConsumeList] = useState<Array<{ id: number; name: string; balance: number }>>([])
  const [picked, setPicked] = useState<number[]>([])
  const [startMin, setStartMin] = useState(9 * 60)
  const [endMin, setEndMin] = useState(10 * 60 + 30)

  const load = useCallback(async (start?: string) => {
    try {
      const d = await api<TimetableData>(`/timetable${start ? `?start=${start}` : ''}`)
      setData(d)
      setError('')
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api<{ classes: Array<{ id: number; name: string; course_name: string }> }>('/meta')
      .then(setMeta)
      .catch(() => {})
  }, [])

  // 开发态：?pick=1 自动选中第一节课，方便截图/调试
  useEffect(() => {
    if (!import.meta.env.DEV || !data) return
    if (new URLSearchParams(location.search).get('pick')) {
      const first = data.days.flatMap((d) => d.sessions).find((s) => s.status !== 'cancelled')
      if (first) setSelected(first)
    }
    if (new URLSearchParams(location.search).get('consume') && selected) {
      openConsume()
    }
    if (new URLSearchParams(location.search).get('plan')) {
      setForm({
        classId: '',
        weekday: String(new Date().getDay()),
        date: data.weekStart,
        slotId: '',
        room: '',
      })
      setShowPlan(true)
    }
  }, [data, selected])

  const total = useMemo(
    () => data?.days.reduce((n, d) => n + d.sessions.filter((s) => s.status !== 'cancelled').length, 0) ?? 0,
    [data]
  )

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true)
    try {
      await fn()
      setFlash(msg)
      await load(data?.weekStart)
      setTimeout(() => setFlash(''), 2200)
    } catch (e) {
      setFlash(e instanceof Error ? e.message : '操作失败')
      setTimeout(() => setFlash(''), 2600)
    } finally {
      setBusy(false)
      setMoveTo('')
    }
  }

  async function openConsume() {
    if (!selected) return
    setBusy(true)
    try {
      const d = await api<{ students: Array<{ id: number; name: string; balance: number }> }>(
        `/students?classId=${selected.classId}`
      )
      setConsumeList(d.students)
      setPicked(d.students.map((s) => s.id))
      setShowConsume(true)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '读取学员失败')
      setTimeout(() => setFlash(''), 2400)
    } finally {
      setBusy(false)
    }
  }

  async function submitConsume() {
    if (!selected || picked.length === 0) {
      setFlash('至少选一个到场的学员')
      setTimeout(() => setFlash(''), 2200)
      return
    }
    setBusy(true)
    try {
      const r = await api<{ consumed: number; skipped: string[] }>('/lessons/consume', {
        body: { sessionId: selected.id, studentIds: picked },
      })
      setShowConsume(false)
      setSelected(null)
      setFlash(`已为 ${r.consumed} 人消课${r.skipped.length ? `，${r.skipped.length} 人跳过` : ''}`)
      await load(data?.weekStart)
      setTimeout(() => setFlash(''), 2600)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '消课失败')
      setTimeout(() => setFlash(''), 2600)
    } finally {
      setBusy(false)
    }
  }

  async function submitPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!form.classId) {
      setFlash('请选择班级')
      setTimeout(() => setFlash(''), 2200)
      return
    }
    if (endMin <= startMin) {
      setFlash('结束时间要晚于开始时间')
      setTimeout(() => setFlash(''), 2200)
      return
    }
    setBusy(true)
    try {
      if (planMode === 'weekly') {
        await api('/schedule/rule', {
          body: {
            classId: Number(form.classId),
            weekday: Number(form.weekday || new Date().getDay()),
            startTime: fmtMin(startMin),
            endTime: fmtMin(endMin),
            room: form.room,
          },
        })
      } else {
        await api('/sessions', {
          body: {
            date: form.date || data?.weekStart,
            classId: Number(form.classId),
            startTime: fmtMin(startMin),
            endTime: fmtMin(endMin),
            room: form.room,
          },
        })
      }
      setShowPlan(false)
      setFlash(planMode === 'weekly' ? '已加入每周课表' : '已加一节课')
      await load(data?.weekStart)
      setTimeout(() => setFlash(''), 2400)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '排课失败')
      setTimeout(() => setFlash(''), 2800)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="loading">{error}</div>
  if (!data) return <div className="loading">加载中…</div>

  const selSlot = selected ? data.slots.find((s) => s.id === selected.slotId) : undefined
  const selDay = selected ? data.days.find((d) => d.sessions.some((s) => s.id === selected.id)) : undefined

  return (
    <div className="tt-wrap">
      <div className="tt-board">
        <div className="tt-toolbar">
          <button className="pill small" onClick={() => load(shift(data.weekStart, -7))}>
            ← 上一周
          </button>
          <div className="tt-range">
            <b>{data.label}</b>
            <span>第 {data.week} 周 · 共 {total} 节课</span>
          </div>
          <button className="pill small" onClick={() => load(shift(data.weekStart, 7))}>
            下一周 →
          </button>
          <button className="pill small ghost" onClick={() => load()}>
            回到本周
          </button>
          <button
            className="pill small dark"
            style={{ height: 32, padding: '0 14px', fontSize: 13 }}
            onClick={() => {
              setForm({
                classId: '',
                weekday: String(new Date().getDay()),
                date: data.weekStart,
                slotId: '',
                room: '',
              })
              setStartMin(9 * 60)
              setEndMin(10 * 60 + 30)
              setPlanMode('weekly')
              setShowPlan(true)
            }}
          >
            ＋ 排课
          </button>
          {flash && <span className="tt-flash">{flash}</span>}
        </div>

        <div className="tt-grid">
          <div className="tt-cell tt-corner">时间</div>
          {data.days.map((d) => (
            <div className={`tt-cell tt-dayhead${d.isToday ? ' today' : ''}`} key={d.date}>
              <b>{WD[d.weekday]}</b>
              <span>{d.date.slice(5).replace('-', '/')}</span>
            </div>
          ))}

          {data.slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              days={data.days}
              onPick={(s) => {
                setSelected(s)
                setMoveTo('')
              }}
            />
          ))}
        </div>
      </div>

      {selected && (
        <aside className="tt-side">
          <div className="tt-side-head">
            <div>
              <div className="tts-when">
                {selDay ? `${WD[selDay.weekday]} ${selDay.date.slice(5).replace('-', '/')}` : ''}
                {selSlot ? `　${selSlot.start_time}–${selSlot.end_time}` : ''}
              </div>
              <h3>{selected.courseName}</h3>
              <p>
                {selected.className}
                {selected.room ? ` · 教室 ${selected.room}` : ''} · 应到 {selected.expected} 人
              </p>
            </div>
            <button className="tt-close" onClick={() => setSelected(null)} aria-label="关闭">
              ×
            </button>
          </div>

          <div className="tt-state">
            状态
            <b className={`tts-${selected.status}`}>
              {selected.status === 'planned' ? '待上课' : selected.status === 'done' ? '已下课' : '已停课'}
            </b>
          </div>

          <div className="tt-actions">
            {selected.status !== 'cancelled' && (
              <button className="pill small dark" disabled={busy} onClick={openConsume}>
                消课
              </button>
            )}
            {selected.status === 'planned' && (
              <button
                className="pill small dark"
                disabled={busy}
                onClick={() => act(() => api(`/sessions/${selected.id}/status`, { body: { status: 'done' } }), '已标记完成')}
              >
                标记已下课
              </button>
            )}
            {selected.status === 'done' && (
              <button
                className="pill small"
                disabled={busy}
                onClick={() => act(() => api(`/sessions/${selected.id}/status`, { body: { status: 'planned' } }), '已撤销下课')}
              >
                撤销下课
              </button>
            )}
            {selected.status === 'cancelled' ? (
              <button
                className="pill small dark"
                disabled={busy}
                onClick={() => act(() => api(`/sessions/${selected.id}/status`, { body: { status: 'planned' } }), '已恢复')}
              >
                恢复这节
              </button>
            ) : (
              <button
                className="pill small"
                disabled={busy}
                onClick={() => act(() => api(`/sessions/${selected.id}/status`, { body: { status: 'cancelled' } }), '已停课')}
              >
                停课
              </button>
            )}
          </div>

          <div className="tt-move">
            <label>调到其他时段</label>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value ? Number(e.target.value) : '')}>
              <option value="">选择时段…</option>
              {data.slots
                .filter((s) => s.id !== selected.slotId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.start_time}–{s.end_time}（{s.name}）
                  </option>
                ))}
            </select>
            <button
              className="pill small"
              disabled={busy || !moveTo}
              onClick={() =>
                act(() => api(`/sessions/${selected.id}/move`, { body: { slotId: moveTo } }), '已改时段')
              }
            >
              确认调课
            </button>
          </div>

          <p className="tt-hint">
            停课不会删除记录，课时也不会扣。改时段只调整这一节，不影响每周固定课表。
          </p>
        </aside>
      )}

      {showConsume && selected && (
        <div className="mask" onClick={() => setShowConsume(false)}>
          <div className="dlg" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>消课 · {selected.courseName}</h3>
              <button type="button" className="tt-close" onClick={() => setShowConsume(false)}>
                ×
              </button>
            </div>
            <p className="dlg-hint" style={{ marginTop: -6 }}>
              勾选今天到场的学生，每人扣 1 课时。已扣过的人会自动跳过。
            </p>
            <div className="ck-list">
              {consumeList.length === 0 && <div className="st-empty">这个班还没有学员</div>}
              {consumeList.map((st) => {
                const on = picked.includes(st.id)
                return (
                  <button
                    type="button"
                    key={st.id}
                    className={`ck-row${on ? ' on' : ''}`}
                    onClick={() =>
                      setPicked(on ? picked.filter((id) => id !== st.id) : [...picked, st.id])
                    }
                  >
                    <span className="ck-box">{on ? '✓' : ''}</span>
                    <span className="ck-nm">{st.name}</span>
                    <span className={`ck-bal${st.balance <= 3 ? ' low' : ''}`}>{st.balance}</span>
                  </button>
                )
              })}
            </div>
            <div className="dlg-foot">
              <button
                type="button"
                className="pill small"
                onClick={() => setPicked(picked.length === consumeList.length ? [] : consumeList.map((s) => s.id))}
              >
                {picked.length === consumeList.length ? '全不选' : '全选'}
              </button>
              <button type="button" className="pill small" onClick={() => setShowConsume(false)}>
                取消
              </button>
              <button type="button" className="pill small dark" disabled={busy} onClick={submitConsume}>
                {busy ? '提交中…' : `确认消课（${picked.length} 人）`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlan && (
        <div className="mask" onClick={() => setShowPlan(false)}>
          <form className="dlg" onClick={(e) => e.stopPropagation()} onSubmit={submitPlan}>
            <div className="dlg-head">
              <h3>排一节课</h3>
              <button type="button" className="tt-close" onClick={() => setShowPlan(false)}>
                ×
              </button>
            </div>

            <div className="seg">
              <button
                type="button"
                className={planMode === 'weekly' ? 'on' : ''}
                onClick={() => setPlanMode('weekly')}
              >
                每周固定
              </button>
              <button
                type="button"
                className={planMode === 'once' ? 'on' : ''}
                onClick={() => setPlanMode('once')}
              >
                只加这一次
              </button>
            </div>

            <div className="dlg-body">
              <label>
                班级
                <select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  <option value="">选择班级…</option>
                  {(meta?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{c.course_name}）
                    </option>
                  ))}
                </select>
              </label>

              {planMode === 'weekly' ? (
                <label>
                  星期
                  <select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
                    {WD.map((w, i) => (
                      <option key={i} value={i}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  日期
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </label>
              )}

              <div className="tr" style={{ gridColumn: '1 / -1' }}>
                <div className="tr-head">
                  <span>时段</span>
                  <b className="tr-time">{fmtMin(startMin)}</b>
                  <span className="tr-dash">—</span>
                  <b className="tr-time">{fmtMin(endMin)}</b>
                  <span className="tr-dur">
                    共 {Math.floor((endMin - startMin) / 60)} 小时
                    {(endMin - startMin) % 60 ? ` ${(endMin - startMin) % 60} 分` : ''}
                  </span>
                </div>
                <div className="tr-track">
                  <i
                    className="tr-fill"
                    style={{
                      left: `${((startMin - T_MIN) / (T_MAX - T_MIN)) * 100}%`,
                      width: `${((endMin - startMin) / (T_MAX - T_MIN)) * 100}%`,
                    }}
                  />
                  <i className="tr-knob" style={{ left: `${((startMin - T_MIN) / (T_MAX - T_MIN)) * 100}%` }} />
                  <i className="tr-knob" style={{ left: `${((endMin - T_MIN) / (T_MAX - T_MIN)) * 100}%` }} />
                </div>
                <input
                  type="range"
                  min={T_MIN}
                  max={T_MAX}
                  step={T_STEP}
                  value={startMin}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setStartMin(v)
                    if (v >= endMin) setEndMin(Math.min(T_MAX, v + T_STEP))
                  }}
                />
                <input
                  type="range"
                  min={T_MIN}
                  max={T_MAX}
                  step={T_STEP}
                  value={endMin}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setEndMin(v)
                    if (v <= startMin) setStartMin(Math.max(T_MIN, v - T_STEP))
                  }}
                />
                <div className="tr-scale">
                  <span>07:00</span><span>12:00</span><span>17:00</span><span>22:00</span>
                </div>
              </div>

              <label>
                教室（可留空）
                <input
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="例如 302"
                />
              </label>
            </div>

            <p className="dlg-hint">
              {planMode === 'weekly'
                ? '每周固定的课会自动出现在之后每一周，改单次不影响规则。'
                : '只往选中的那一天加一节，之后不会重复。'}
            </p>

            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowPlan(false)}>
                取消
              </button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function SlotRow({
  slot,
  days,
  onPick,
}: {
  slot: Slot
  days: Day[]
  onPick: (s: TSession) => void
}) {
  return (
    <>
      <div className="tt-cell tt-time">
        <b>{slot.start_time}</b>
        <span>{slot.end_time}</span>
      </div>
      {days.map((d) => {
        const list = d.sessions.filter((s) => s.slotId === slot.id)
        return (
          <div className={`tt-cell tt-slot${d.isToday ? ' today' : ''}`} key={d.date + slot.id}>
            {list.map((s) => (
              <button
                key={s.id}
                className={`tt-card ${TONE[s.classId % TONE.length]}${s.status === 'cancelled' ? ' cancelled' : ''}`}
                onClick={() => onPick(s)}
              >
                <span className="ttc-course">{s.courseName}</span>
                <span className="ttc-meta">
                  {s.className}
                  {s.room ? ` · ${s.room}` : ''}
                </span>
                <span className="ttc-n">
                  {s.status === 'cancelled' ? '停课' : s.status === 'done' ? '已下课' : `${s.expected} 人`}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}
