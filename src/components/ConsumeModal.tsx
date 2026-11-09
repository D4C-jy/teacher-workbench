import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface ConsumeModalProps {
  session: { id: number; classId: number; courseName: string; className: string } | null
  onClose: () => void
  onDone: (msg: string) => void
}

/**
 * 消课弹窗（三态：到课/请假/未到）。
 * 首页和课表页共用。
 */
export default function ConsumeModal({ session, onClose, onDone }: ConsumeModalProps) {
  const [students, setStudents] = useState<Array<{ id: number; name: string; balance: number }>>([])
  const [states, setStates] = useState<Record<number, 'present' | 'leave' | 'absent'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return
    setBusy(true)
    setError('')
    const sid = session.id
    const cid = session.classId
    api<{ students: Array<{ id: number; name: string; balance: number }> }>(`/students?classId=${cid}`)
      .then((d) => {
        setStudents(d.students)
        setStates(Object.fromEntries(d.students.map((s) => [s.id, 'present'])))
      })
      .catch((e) => setError(e instanceof Error ? e.message : '读取学员失败'))
      .finally(() => setBusy(false))
  }, [session])

  if (!session) return null

  function setStudentState(sid: number, state: 'present' | 'leave' | 'absent') {
    setStates((prev) => ({ ...prev, [sid]: state }))
  }
  function setAll(state: 'present' | 'leave' | 'absent') {
    setStates(Object.fromEntries(students.map((s) => [s.id, state])))
  }

  async function submit() {
    if (!session) return
    const entries = Object.entries(states).map(([studentId, state]) => ({ studentId: Number(studentId), state }))
    if (entries.length === 0) {
      setError('请先勾选学员')
      return
    }
    setBusy(true)
    setError('')
    try {
      const r = await api<{ present: number; leave: number; absent: number; skipped: string[] }>(
        '/lessons/consume',
        { body: { sessionId: session.id, entries } }
      )
      const parts = [`到课 ${r.present} 人`]
      if (r.leave) parts.push(`请假 ${r.leave} 人`)
      if (r.absent) parts.push(`未到 ${r.absent} 人`)
      onDone(parts.join(' · '))
    } catch (err) {
      setError(err instanceof Error ? err.message : '消课失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mask" onClick={onClose}>
      <div className="dlg" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="dlg-head">
          <h3>消课 · {session.courseName}</h3>
          <button type="button" className="tt-close" onClick={onClose}>×</button>
        </div>
        <p className="dlg-hint" style={{ marginTop: -6 }}>
          到课扣 1 课时；请假、未到不扣课时。请假会在后台标记「待补课」。
        </p>
        <div className="ck-list">
          {error && <div className="err" style={{ marginBottom: 6 }}>{error}</div>}
          {students.length === 0 && !busy && <div className="st-empty">这个班还没有学员</div>}
          {students.map((st) => {
            const stState = states[st.id] ?? 'present'
            return (
              <div key={st.id} className="ck-row">
                <span className="ck-nm">{st.name}</span>
                <span className={`ck-bal${st.balance <= 3 ? ' low' : ''}`}>{st.balance}</span>
                <span className="ck-states">
                  <button type="button" className={`ck-state present${stState === 'present' ? ' on' : ''}`} onClick={() => setStudentState(st.id, 'present')}>到课</button>
                  <button type="button" className={`ck-state leave${stState === 'leave' ? ' on' : ''}`} onClick={() => setStudentState(st.id, 'leave')}>请假</button>
                  <button type="button" className={`ck-state absent${stState === 'absent' ? ' on' : ''}`} onClick={() => setStudentState(st.id, 'absent')}>未到</button>
                </span>
              </div>
            )
          })}
        </div>
        <div className="dlg-foot">
          <button type="button" className="pill small" onClick={() => setAll('present')}>全到课</button>
          <button type="button" className="pill small" onClick={() => setAll('leave')}>全请假</button>
          <button type="button" className="pill small" onClick={onClose}>取消</button>
          <button type="button" className="pill small dark" disabled={busy} onClick={submit}>
            {busy ? '提交中…' : `确认（${Object.keys(states).length} 人）`}
          </button>
        </div>
      </div>
    </div>
  )
}
