import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Figure } from '../components/Glyphs'
import RollNum from '../components/RollNum'

interface StudentItem {
  id: number
  name: string
  classId: number
  className: string
  courseName: string
  enrollmentId: number
  balance: number
  expireAt: string | null
  low: boolean
}

interface Summary {
  total: number
  low: number
  zero: number
  sum: number
}

interface Detail {
  student: {
    id: number
    name: string
    gender: string | null
    guardian_name: string | null
    guardian_phone: string | null
    note: string | null
  }
  enrollments: Array<{
    id: number
    class_id: number
    class_name: string
    course_name: string
    balance: number
    purchased_lessons: number
    expire_at: string | null
  }>
  ledger: Array<{
    id: number
    type: string
    delta: number
    occurred_at: string
    reason: string | null
    class_name: string
  }>
}

const TYPE_LABEL: Record<string, string> = {
  charge: '充值',
  consume: '消课',
  refund: '退款',
  adjust: '调整',
}

export default function Students() {
  const [list, setList] = useState<StudentItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [q, setQ] = useState('')
  const [classId, setClassId] = useState(0)
  const [classes, setClasses] = useState<Array<{ id: number; name: string; course_name: string }>>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [showRecharge, setShowRecharge] = useState(false)
  const [recharge, setRecharge] = useState({ lessons: '10', note: '续费', expireAt: '', amount: '' })
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    gender: '',
    guardianName: '',
    guardianPhone: '',
    classId: '',
    lessons: '10',
  })

  const load = useCallback(async () => {
    try {
      const d = await api<{ students: StudentItem[]; summary: Summary }>(
        `/students?q=${encodeURIComponent(q)}&classId=${classId}`
      )
      setList(d.students)
      setSummary(d.summary)
      setError('')
      if (d.students.length > 0 && activeId === null) setActiveId(d.students[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [q, classId, activeId])

  useEffect(() => {
    api<{ classes: Array<{ id: number; name: string; course_name: string }> }>('/meta')
      .then((d) => setClasses(d.classes))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (activeId == null) {
      setDetail(null)
      return
    }
    api<Detail>(`/students/${activeId}`)
      .then(setDetail)
      .catch(() => setDetail(null))
  }, [activeId])

  async function doAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim()) {
      setFlash('请填学员姓名')
      return
    }
    setBusy(true)
    try {
      await api('/students', {
        body: {
          name: addForm.name.trim(),
          gender: addForm.gender || undefined,
          guardianName: addForm.guardianName.trim(),
          guardianPhone: addForm.guardianPhone.trim(),
          classId: Number(addForm.classId || 0),
          lessons: Number(addForm.lessons) || 0,
        },
      })
      setShowAdd(false)
      setAddForm({ name: '', gender: '', guardianName: '', guardianPhone: '', classId: '', lessons: '10' })
      setFlash('已新增学员')
      await load()
      setTimeout(() => setFlash(''), 2400)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '新增失败')
    } finally {
      setBusy(false)
    }
  }

  async function doRecharge(e: React.FormEvent) {
    e.preventDefault()
    if (!activeId) return
    const n = Number(recharge.lessons)
    if (!Number.isFinite(n) || n <= 0) {
      setFlash('课时数要大于 0')
      return
    }
    setBusy(true)
    try {
      await api(`/students/${activeId}/recharge`, {
        body: {
          lessons: n,
          note: recharge.note || '充值',
          amount: recharge.amount ? Number(recharge.amount) : undefined,
          expireAt: recharge.expireAt || undefined,
          enrollmentId: detail?.enrollments[0]?.id,
        },
      })
      setShowRecharge(false)
      setFlash(`已充值 ${n} 课时`)
      await load()
      const d = await api<Detail>(`/students/${activeId}`)
      setDetail(d)
      setTimeout(() => setFlash(''), 2400)
    } catch (err) {
      setFlash(err instanceof Error ? err.message : '充值失败')
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv() {
    const token = localStorage.getItem('twb.token')
    const res = await fetch('/api/export/students.csv', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `学员课时-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="loading">{error}</div>

  return (
    <div className="st-wrap">
      <section className="st-main">
        <div className="st-toolbar">
          <input
            className="st-search"
            placeholder="搜索学员姓名…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="st-filter">
            <button className={classId === 0 ? 'on' : ''} onClick={() => setClassId(0)}>
              全部
            </button>
            {classes.map((c) => (
              <button key={c.id} className={classId === c.id ? 'on' : ''} onClick={() => setClassId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <button className="pill small dark" onClick={() => setShowAdd(true)} style={{ height: 32 }}>
            ＋ 新增学员
          </button>
          <button className="pill small" onClick={exportCsv} style={{ height: 32 }}>
            导出 CSV
          </button>
        </div>

        {summary && (
          <div className="st-summary">
            <div>
              <RollNum value={summary.total} />
              <span>在读学员</span>
            </div>
            <div>
              <RollNum value={summary.low} style={{ color: 'var(--alert)' }} />
              <span>课时不足</span>
            </div>
            <div>
              <RollNum value={summary.sum} />
              <span>剩余总课时</span>
            </div>
          </div>
        )}

        <div className="st-list">
          {list.length === 0 && <div className="st-empty">没有符合条件的学员</div>}
          {list.map((s) => (
            <button
              key={s.id}
              className={`st-row${activeId === s.id ? ' on' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <span className="st-av">
                <Figure size={22} />
              </span>
              <span className="st-nm">
                {s.name}
                <small>
                  {s.className} · {s.courseName}
                </small>
              </span>
              <span className={`st-bal${s.low ? ' low' : ''}`}>{s.balance}</span>
              <span className={`st-tag${s.low ? ' low' : ''}`}>{s.balance <= 0 ? '已用完' : s.low ? '需续费' : '正常'}</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="st-side">
        {!detail ? (
          <div className="st-empty">左边选一个学员</div>
        ) : (
          <div className="st-detail" key={activeId}>
            <div className="st-head">
              <div>
                <h2>
                  {detail.student.name}
                  {detail.student.gender && (
                    <span className="st-gender">{detail.student.gender === 'male' ? '男' : '女'}</span>
                  )}
                </h2>
                <p>
                  {detail.enrollments.map((e) => `${e.class_name} · ${e.course_name}`).join('　')}
                </p>
                {(detail.student.guardian_name || detail.student.guardian_phone) && (
                  <p className="st-guardian">
                    {detail.student.guardian_name && `家长：${detail.student.guardian_name}`}
                    {detail.student.guardian_name && detail.student.guardian_phone && '　'}
                    {detail.student.guardian_phone && `电话 ${detail.student.guardian_phone}`}
                  </p>
                )}
              </div>
              <span className="st-av big">
                <Figure size={30} />
              </span>
            </div>

            {detail.enrollments.map((e) => (
              <div className="st-card" key={e.id}>
                <div className="stc-num">
                  <RollNum value={e.balance} />
                  <span>剩余课时</span>
                </div>
                <div className="stc-meta">
                  <div>
                    <span>课时包</span>
                    <b>{e.purchased_lessons} 节</b>
                  </div>
                  <div>
                    <span>到期日</span>
                    <b>{e.expire_at ?? '未设置'}</b>
                  </div>
                </div>
                <button className="pill small dark" onClick={() => setShowRecharge(true)} style={{ height: 34 }}>
                  ＋ 充值课时
                </button>
              </div>
            ))}

            <div className="st-timeline-title">
              课时流水<i />
            </div>
            <div className="st-timeline">
              {detail.ledger.length === 0 && <div className="st-empty">还没有记录</div>}
              {detail.ledger.map((l) => (
                <div className="st-li" key={l.id}>
                  <span className={`st-li-dot ${l.delta > 0 ? 'up' : 'down'}`} />
                  <span className="st-li-main">
                    {TYPE_LABEL[l.type] ?? l.type}
                    {l.reason ? ` · ${l.reason}` : ''}
                    <small>{l.occurred_at.slice(0, 16)}</small>
                  </span>
                  <span className={`st-li-num ${l.delta > 0 ? 'up' : 'down'}`}>
                    {l.delta > 0 ? '+' : ''}
                    {l.delta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {showRecharge && (
        <div className="mask" onClick={() => setShowRecharge(false)}>
          <form className="dlg" style={{ width: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={doRecharge}>
            <div className="dlg-head">
              <h3>给 {detail?.student.name} 充值</h3>
              <button type="button" className="tt-close" onClick={() => setShowRecharge(false)}>
                ×
              </button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                充值课时
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={recharge.lessons}
                  onChange={(e) => setRecharge({ ...recharge, lessons: e.target.value })}
                />
              </label>
              <label>
                报名金额（元）
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={recharge.amount}
                  onChange={(e) => setRecharge({ ...recharge, amount: e.target.value })}
                  placeholder="例如 2400"
                />
              </label>
              <label>
                备注
                <input
                  value={recharge.note}
                  onChange={(e) => setRecharge({ ...recharge, note: e.target.value })}
                  placeholder="例如 秋季续费"
                />
              </label>
              <label>
                有效期至（可留空）
                <input
                  type="date"
                  value={recharge.expireAt}
                  onChange={(e) => setRecharge({ ...recharge, expireAt: e.target.value })}
                />
              </label>
            </div>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowRecharge(false)}>
                取消
              </button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '保存中…' : '确认充值'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAdd && (
        <div className="mask" onClick={() => setShowAdd(false)}>
          <form className="dlg" style={{ width: 440 }} onClick={(e) => e.stopPropagation()} onSubmit={doAdd}>
            <div className="dlg-head">
              <h3>新增学员</h3>
              <button type="button" className="tt-close" onClick={() => setShowAdd(false)}>×</button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>
                姓名 *
                <input
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  placeholder="学员姓名"
                  autoFocus
                />
              </label>
              <label>
                性别
                <select
                  value={addForm.gender}
                  onChange={(e) => setAddForm({ ...addForm, gender: e.target.value })}
                >
                  <option value="">（未设置）</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </label>
              <label>
                家长姓名
                <input
                  value={addForm.guardianName}
                  onChange={(e) => setAddForm({ ...addForm, guardianName: e.target.value })}
                  placeholder="家长姓名（可留空）"
                />
              </label>
              <label>
                家长电话
                <input
                  value={addForm.guardianPhone}
                  onChange={(e) => setAddForm({ ...addForm, guardianPhone: e.target.value })}
                  placeholder="手机号（可留空）"
                />
              </label>
              <label>
                报名班级
                <select
                  value={addForm.classId}
                  onChange={(e) => setAddForm({ ...addForm, classId: e.target.value })}
                >
                  <option value="">（暂不报名）</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（{c.course_name}）
                    </option>
                  ))}
                </select>
              </label>
              <label>
                报名课包（课时）
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={addForm.lessons}
                  onChange={(e) => setAddForm({ ...addForm, lessons: e.target.value })}
                  placeholder="例如 10"
                />
              </label>
            </div>
            <p className="dlg-hint">
              选了报名班级和课包，会同时建一条报名记录和充值流水。也可以只建学员，稍后再报名。
            </p>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowAdd(false)}>取消</button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}

      {flash && <div className="st-flash">{flash}</div>}
    </div>
  )
}
