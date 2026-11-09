import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

interface ClassItem {
  id: number
  name: string
  course_id: number
  capacity: number
  course_name: string
  student_count: number
  students: Array<{ id: number; name: string; balance: number }>
}

interface Course {
  id: number
  name: string
}

interface Unassigned {
  id: number
  name: string
}

export default function Classes() {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [unassigned, setUnassigned] = useState<Unassigned[]>([])
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)

  const [activeId, setActiveId] = useState<number | null>(null)
  const [showAddClass, setShowAddClass] = useState(false)
  const [addClass, setAddClass] = useState({ name: '', courseId: '', capacity: '12' })
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [addStudent, setAddStudent] = useState({ studentId: '', name: '' })

  const load = useCallback(async () => {
    try {
      const d = await api<{ classes: ClassItem[]; courses: Course[]; unassigned: Unassigned[] }>('/classes')
      setClasses(d.classes)
      setCourses(d.courses)
      setUnassigned(d.unassigned)
      setError('')
      if (d.classes.length > 0 && (activeId === null || !d.classes.some((c) => c.id === activeId))) {
        setActiveId(d.classes[0].id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [activeId])

  useEffect(() => {
    load()
  }, [load])

  function toast(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2400)
  }

  async function createClass(e: React.FormEvent) {
    e.preventDefault()
    if (!addClass.name.trim() || !addClass.courseId) return toast('请填班级名和课程')
    setBusy(true)
    try {
      await api('/classes', {
        body: {
          name: addClass.name.trim(),
          courseId: Number(addClass.courseId),
          capacity: Number(addClass.capacity) || 12,
        },
      })
      setShowAddClass(false)
      setAddClass({ name: '', courseId: '', capacity: '12' })
      toast('已创建班级')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '创建失败')
    } finally {
      setBusy(false)
    }
  }

  async function addStudentToClass(e: React.FormEvent) {
    e.preventDefault()
    if (!activeId) return
    if (!addStudent.studentId && !addStudent.name.trim()) return toast('请选择或输入学员')
    setBusy(true)
    try {
      await api(`/classes/${activeId}/students`, {
        body: { studentId: Number(addStudent.studentId || 0), name: addStudent.name.trim() },
      })
      setShowAddStudent(false)
      setAddStudent({ studentId: '', name: '' })
      toast('已加入班级')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  async function deleteClass() {
    if (!active) return
    const warn =
      active.student_count > 0
        ? `班级里有 ${active.student_count} 名学员，删除后他们会转到「未分班」。`
        : '这个班级没有学员。'
    if (!confirm(`确认删除班级「${active.name}」？\n\n${warn}\n相关的课表和周排课也会一并删除。此操作不可恢复。`)) {
      return
    }
    setBusy(true)
    try {
      await api(`/classes/${active.id}`, { method: 'DELETE' })
      setActiveId(null)
      toast('已删除班级')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeStudent(studentId: number, name: string) {
    if (!activeId) return
    if (!confirm(`把 ${name} 从班级移除？不会删除学员和课时记录。`)) return
    setBusy(true)
    try {
      await api(`/classes/${activeId}/students/${studentId}`, { method: 'DELETE' })
      toast(`已移除 ${name}`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : '移除失败')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="loading">{error}</div>

  const active = classes.find((c) => c.id === activeId)

  return (
    <div className="st-wrap" style={{ position: 'relative' }}>
      <section className="st-main">
        <div className="st-toolbar">
          <span style={{ fontSize: 14, fontWeight: 650 }}>班级</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{classes.length} 个班</span>
          <div style={{ flex: 1 }} />
          <button className="pill small dark" onClick={() => setShowAddClass(true)} style={{ height: 32 }}>
            ＋ 新建班级
          </button>
        </div>

        <div className="st-list">
          {classes.length === 0 && <div className="st-empty">还没有班级，点右上角新建</div>}
          {classes.map((c) => (
            <button
              key={c.id}
              className={`st-row${activeId === c.id ? ' on' : ''}`}
              onClick={() => setActiveId(c.id)}
            >
              <span className="st-av" style={{ background: 'var(--ink)', color: '#fff' }}>
                {c.name.slice(0, 1)}
              </span>
              <span className="st-nm">
                {c.name}
                <small>{c.course_name}</small>
              </span>
              <span className="st-bal" style={{ fontSize: 16 }}>
                {c.student_count} 人
              </span>
              <span className="st-tag">{c.capacity} 座</span>
            </button>
          ))}
        </div>
      </section>

      <aside className="st-side">
        {!active ? (
          <div className="st-empty">左边选一个班级</div>
        ) : (
          <>
            <div className="st-head">
              <div>
                <h2>{active.name}</h2>
                <p>{active.course_name} · {active.student_count} 名学员 / {active.capacity} 座</p>
              </div>
              <button className="pill small" onClick={deleteClass} disabled={busy} style={{ height: 28, color: '#a32b2b', borderColor: '#e0b9b3' }}>
                删除班级
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pill small dark" onClick={() => setShowAddStudent(true)} style={{ height: 32 }}>
                ＋ 添加学员
              </button>
            </div>

            <div className="st-timeline-title">
              学员名单 <i />
            </div>
            <div className="st-timeline">
              {active.students.length === 0 && <div className="st-empty">还没有学员</div>}
              {active.students.map((s) => (
                <div className="st-li" key={s.id}>
                  <span className="st-li-dot" style={{ background: '#7aa06f' }} />
                  <span className="st-li-main">
                    {s.name}
                    <small>剩余 {s.balance} 课时</small>
                  </span>
                  <button
                    className="pill small"
                    style={{ height: 26, fontSize: 11 }}
                    onClick={() => removeStudent(s.id, s.name)}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>

      {showAddClass && (
        <div className="mask" onClick={() => setShowAddClass(false)}>
          <form className="dlg" style={{ width: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={createClass}>
            <div className="dlg-head">
              <h3>新建班级</h3>
              <button type="button" className="tt-close" onClick={() => setShowAddClass(false)}>×</button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                班级名称
                <input
                  value={addClass.name}
                  onChange={(e) => setAddClass({ ...addClass, name: e.target.value })}
                  placeholder="例如 无人机 C 班"
                  autoFocus
                />
              </label>
              <label>
                课程
                <select
                  value={addClass.courseId}
                  onChange={(e) => setAddClass({ ...addClass, courseId: e.target.value })}
                >
                  <option value="">选择课程…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                座位数
                <input
                  type="number"
                  min="1"
                  value={addClass.capacity}
                  onChange={(e) => setAddClass({ ...addClass, capacity: e.target.value })}
                />
              </label>
            </div>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowAddClass(false)}>取消</button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '创建中…' : '创建'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showAddStudent && (
        <div className="mask" onClick={() => setShowAddStudent(false)}>
          <form className="dlg" style={{ width: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={addStudentToClass}>
            <div className="dlg-head">
              <h3>添加到 {active?.name}</h3>
              <button type="button" className="tt-close" onClick={() => setShowAddStudent(false)}>×</button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                从未分班学员中选择
                <select
                  value={addStudent.studentId}
                  onChange={(e) => setAddStudent({ ...addStudent, studentId: e.target.value })}
                >
                  <option value="">（无）</option>
                  {unassigned.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                或输入新学员姓名
                <input
                  value={addStudent.name}
                  onChange={(e) => setAddStudent({ ...addStudent, name: e.target.value })}
                  placeholder="输入姓名可直接新建并加入"
                />
              </label>
            </div>
            <p className="dlg-hint">如果学员已在其他班，会自动转班过来（原班报名关系停用）。</p>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowAddStudent(false)}>取消</button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '添加中…' : '添加'}
              </button>
            </div>
          </form>
        </div>
      )}

      {flash && <div className="st-flash">{flash}</div>}
    </div>
  )
}
