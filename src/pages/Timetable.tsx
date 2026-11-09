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

/**
 * iOS 风格滚轮列：上下滚动选择值，中间高亮。
 * 支持鼠标滚轮 + 拖拽 + 点击上下项。
 */
function WheelColumn({
  values,
  value,
  onChange,
  pad,
}: {
  values: number[]
  value: number
  onChange: (v: number) => void
  pad?: boolean
}) {
  const idx = values.indexOf(value)
  const itemH = 34

  function go(delta: number) {
    const ni = Math.max(0, Math.min(values.length - 1, idx + delta))
    onChange(values[ni])
  }

  function onWheel(e: React.WheelEvent) {
    if (e.deltaY === 0) return
    go(e.deltaY > 0 ? 1 : -1)
  }

  // 拖拽滚动
  let dragging = false
  let lastY = 0

  return (
    <div className="wheel" onWheel={onWheel}>
      <button type="button" className="wheel-up" onClick={() => go(-1)} tabIndex={-1}>
        ▲
      </button>
      <div
        className="wheel-viewport"
        onPointerDown={(e) => {
          dragging = true
          lastY = e.clientY
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragging) return
          const dy = e.clientY - lastY
          if (Math.abs(dy) >= itemH) {
            go(dy < 0 ? 1 : -1)
            lastY = e.clientY
          }
        }}
        onPointerUp={() => {
          dragging = false
        }}
      >
        {values.map((v) => {
          const isCur = v === value
          const rel = values.indexOf(v) - idx
          return (
            <div
              key={v}
              className={`wheel-item${isCur ? ' cur' : ''}`}
              style={{ transform: `translateY(${rel * itemH}px)` }}
              onClick={() => onChange(v)}
            >
              {pad ? String(v).padStart(2, '0') : v}
            </div>
          )
        })}
      </div>
      <button type="button" className="wheel-down" onClick={() => go(1)} tabIndex={-1}>
        ▼
      </button>
    </div>
  )
}

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
  const [states, setStates] = useState<Record<number, 'present' | 'leave' | 'absent'>>({})
  const [showRoster, setShowRoster] = useState(false)
  const [roster, setRoster] = useState<Array<{ id: number; name: string; balance: number }>>([])
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
      setStates(Object.fromEntries(d.students.map((s) => [s.id, 'present'])))
      setShowConsume(true)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '读取学员失败')
      setTimeout(() => setFlash(''), 2400)
    } finally {
      setBusy(false)
    }
  }

  async function submitConsume() {
    if (!selected || Object.keys(states).length === 0) {
      setFlash('请先勾选学员')
      setTimeout(() => setFlash(''), 2200)
      return
    }
    setBusy(true)
    try {
      const entries = Object.entries(states).map(([studentId, state]) => ({ studentId: Number(studentId), state }))
      const r = await api<{ present: number; leave: number; absent: number; skipped: string[] }>(
        '/lessons/consume',
        { body: { sessionId: selected.id, entries } }
      )
      setShowConsume(false)
      setSelected(null)
      const parts = [`到课 ${r.present} 人`]
      if (r.leave) parts.push(`请假 ${r.leave} 人`)
      if (r.absent) parts.push(`未到 ${r.absent} 人`)
      if (r.skipped.length) parts.push(`跳过 ${r.skipped.length}`)
      setFlash(parts.join(' · '))
      await load(data?.weekStart)
      setTimeout(() => setFlash(''), 2600)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '消课失败')
      setTimeout(() => setFlash(''), 2600)
    } finally {
      setBusy(false)
    }
  }

  async function openRoster() {
    if (!selected) return
    setBusy(true)
    try {
      const d = await api<{ students: Array<{ id: number; name: string; balance: number }> }>(
        `/students?classId=${selected.classId}`
      )
      setRoster(d.students)
      setShowRoster(true)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '读取失败')
      setTimeout(() => setFlash(''), 2400)
    } finally {
      setBusy(false)
    }
  }

  function setStudentState(sid: number, state: 'present' | 'leave' | 'absent') {
    setStates((prev) => ({ ...prev, [sid]: state }))
  }

  function setAll(state: 'present' | 'leave' | 'absent') {
    setStates(Object.fromEntries(consumeList.map((s) => [s.id, state])))
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
            <button className="pill small" disabled={busy} onClick={openRoster}>
              查看学员
            </button>
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

      {showRoster && selected && (
        <div className="mask" onClick={() => setShowRoster(false)}>
          <div className="dlg" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>{selected.className} · {roster.length} 名学员</h3>
              <button type="button" className="tt-close" onClick={() => setShowRoster(false)}>×</button>
            </div>
            <div className="ck-list">
              {roster.length === 0 && <div className="st-empty">这个班还没有学员</div>}
              {roster.map((st) => (
                <div key={st.id} className="ck-row">
                  <span className="ck-nm">{st.name}</span>
                  <span className={`ck-bal${st.balance <= 3 ? ' low' : ''}`}>{st.balance} 节</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
              到课扣 1 课时；请假、未到不扣课时。请假会在后台标记「待补课」。
            </p>
            <div className="ck-list">
              {consumeList.length === 0 && <div className="st-empty">这个班还没有学员</div>}
              {consumeList.map((st) => {
                const stState = states[st.id] ?? 'present'
                return (
                  <div key={st.id} className="ck-row">
                    <span className="ck-nm">{st.name}</span>
                    <span className={`ck-bal${st.balance <= 3 ? ' low' : ''}`}>{st.balance}</span>
                    <span className="ck-states">
                      <button
                        type="button"
                        className={`ck-state present${stState === 'present' ? ' on' : ''}`}
                        onClick={() => setStudentState(st.id, 'present')}
                      >
                        到课
                      </button>
                      <button
                        type="button"
                        className={`ck-state leave${stState === 'leave' ? ' on' : ''}`}
                        onClick={() => setStudentState(st.id, 'leave')}
                      >
                        请假
                      </button>
                      <button
                        type="button"
                        className={`ck-state absent${stState === 'absent' ? ' on' : ''}`}
                        onClick={() => setStudentState(st.id, 'absent')}
                      >
                        未到
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setAll('present')}>
                全到课
              </button>
              <button type="button" className="pill small" onClick={() => setAll('leave')}>
                全请假
              </button>
              <button type="button" className="pill small" onClick={() => setShowConsume(false)}>
                取消
              </button>
              <button type="button" className="pill small dark" disabled={busy} onClick={submitConsume}>
                {busy ? '提交中…' : `确认（${Object.keys(states).length} 人）`}
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
                  <span>开始时间</span>
                  <b className="tr-time">{fmtMin(startMin)}</b>
                  <span className="tr-dash">—</span>
                  <b className="tr-time">{fmtMin(endMin)}</b>
                  <span className="tr-dur">
                    共 {Math.floor((endMin - startMin) / 60)} 小时
                    {(endMin - startMin) % 60 ? ` ${(endMin - startMin) % 60} 分` : ''}
                  </span>
                </div>
                <div className="wheel-group">
                  <div className="wheel-col">
                    <span className="wheel-label">时</span>
                    <WheelColumn
                      values={Array.from({ length: 16 }, (_, i) => 7 + i)}
                      value={Math.floor(startMin / 60)}
                      onChange={(h) => setStartMin(h * 60 + (startMin % 60))}
                    />
                  </div>
                  <div className="wheel-col">
                    <span className="wheel-label">分</span>
                    <WheelColumn
                      values={[0, 15, 30, 45]}
                      value={startMin % 60}
                      onChange={(m) => setStartMin(Math.floor(startMin / 60) * 60 + m)}
                      pad
                    />
                  </div>
                  <span className="wheel-sep">→</span>
                  <div className="wheel-col">
                    <span className="wheel-label">时</span>
                    <WheelColumn
                      values={Array.from({ length: 16 }, (_, i) => 7 + i)}
                      value={Math.floor(endMin / 60)}
                      onChange={(h) => setEndMin(h * 60 + (endMin % 60))}
                    />
                  </div>
                  <div className="wheel-col">
                    <span className="wheel-label">分</span>
                    <WheelColumn
                      values={[0, 15, 30, 45]}
                      value={endMin % 60}
                      onChange={(m) => setEndMin(Math.floor(endMin / 60) * 60 + m)}
                      pad
                    />
                  </div>
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
