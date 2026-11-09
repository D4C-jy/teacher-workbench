import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Uav } from '../components/Glyphs'

interface EqItem {
  id: number
  code: string
  model: string | null
  status: 'in_stock' | 'lent' | 'repair' | 'retired'
  note: string | null
  purchasedAt: string | null
  loan: { borrower: string; lentAt: string; dueAt: string | null; conditionOut: string | null } | null
}

interface Loan {
  id: number
  borrower_name: string
  lent_at: string
  due_at: string | null
  returned_at: string | null
  condition_out: string | null
  condition_in: string | null
}

const STATUS: Record<string, { label: string; cls: string }> = {
  in_stock: { label: '在库', cls: 'ok' },
  lent: { label: '借出', cls: 'lent' },
  repair: { label: '维修', cls: 'repair' },
  retired: { label: '停用', cls: 'off' },
}

export default function Equipment() {
  const [items, setItems] = useState<EqItem[]>([])
  const [summary, setSummary] = useState({ total: 0, inStock: 0, lent: 0, repair: 0, retired: 0 })
  const [students, setStudents] = useState<Array<{ id: number; name: string }>>([])
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)

  const [lendTarget, setLendTarget] = useState<EqItem | null>(null)
  const [returnTarget, setReturnTarget] = useState<EqItem | null>(null)
  const [historyTarget, setHistoryTarget] = useState<EqItem | null>(null)
  const [history, setHistory] = useState<Loan[]>([])
  const [showAdd, setShowAdd] = useState(false)

  const [lendForm, setLendForm] = useState({ borrower: '', dueAt: '', condition: '' })
  const [returnForm, setReturnForm] = useState({ condition: '', toRepair: false })
  const [addForm, setAddForm] = useState({ code: '', model: '', studentId: '' })

  const load = useCallback(async () => {
    try {
      const d = await api<{ items: EqItem[]; summary: typeof summary }>('/equipment')
      setItems(d.items)
      setSummary(d.summary)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    load()
    api<{ students: Array<{ id: number; name: string }> }>('/students')
      .then((d) => setStudents(d.students))
      .catch(() => {})
  }, [load])

  function toast(msg: string) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 2400)
  }

  async function doLend(e: React.FormEvent) {
    e.preventDefault()
    if (!lendTarget) return
    if (!lendForm.borrower.trim()) return toast('请填借用人')
    setBusy(true)
    try {
      await api(`/equipment/${lendTarget.id}/lend`, {
        body: {
          borrowerName: lendForm.borrower.trim(),
          studentId: addForm.studentId || undefined,
          dueAt: lendForm.dueAt || undefined,
          conditionOut: lendForm.condition || undefined,
        },
      })
      setLendTarget(null)
      setLendForm({ borrower: '', dueAt: '', condition: '' })
      await load()
      toast('已登记借出')
    } catch (err) {
      toast(err instanceof Error ? err.message : '借出失败')
    } finally {
      setBusy(false)
    }
  }

  async function doReturn(e: React.FormEvent) {
    e.preventDefault()
    if (!returnTarget) return
    setBusy(true)
    try {
      await api(`/equipment/${returnTarget.id}/return`, {
        body: { conditionIn: returnForm.condition || undefined, toRepair: returnForm.toRepair },
      })
      setReturnTarget(null)
      setReturnForm({ condition: '', toRepair: false })
      await load()
      toast(returnForm.toRepair ? '已归还，转入维修' : '已归还入库')
    } catch (err) {
      toast(err instanceof Error ? err.message : '归还失败')
    } finally {
      setBusy(false)
    }
  }

  async function doAdd(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/equipment', { body: { code: addForm.code.trim(), model: addForm.model.trim() } })
      setShowAdd(false)
      setAddForm({ code: '', model: '', studentId: '' })
      await load()
      toast('已添加')
    } catch (err) {
      toast(err instanceof Error ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  async function openHistory(item: EqItem) {
    setHistoryTarget(item)
    try {
      const d = await api<{ loans: Loan[] }>(`/equipment/${item.id}/loans`)
      setHistory(d.loans)
    } catch {
      setHistory([])
    }
  }

  async function exportCsv() {
    const token = localStorage.getItem('twb.token')
    const res = await fetch('/api/export/equipment.csv', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `器材台账-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="loading">{error}</div>

  return (
    <div className="eq-wrap">
      <section className="eq-main">
        <div className="eq-toolbar">
          <div className="eq-stat">
            <span>
              <b>{summary.total}</b>总共
            </span>
            <span>
              <b>{summary.inStock}</b>在库
            </span>
            <span>
              <b className="warn">{summary.lent}</b>借出
            </span>
            <span>
              <b className="amber">{summary.repair}</b>维修
            </span>
          </div>
          <button className="pill small" onClick={exportCsv} style={{ height: 32 }}>
            导出台账
          </button>
          <button className="pill small dark" onClick={() => setShowAdd(true)} style={{ height: 32 }}>
            ＋ 添加器材
          </button>
        </div>

        <div className="eq-grid">
          {items.map((it) => {
            const st = STATUS[it.status] ?? STATUS.in_stock
            return (
              <div className={`eq-card ${st.cls}`} key={it.id}>
                <div className="eq-top">
                  <Uav size={26} />
                  <div className="eq-code">{it.code}</div>
                  <span className={`eq-status ${st.cls}`}>{st.label}</span>
                </div>
                <div className="eq-model">{it.model ?? '未填型号'}</div>

                {it.loan ? (
                  <div className="eq-loan">
                    <span>借给</span>
                    <b>{it.loan.borrower}</b>
                    <small>
                      {it.loan.lentAt.slice(5, 16)}
                      {it.loan.dueAt ? ` · 应还 ${it.loan.dueAt.slice(5, 16)}` : ''}
                    </small>
                  </div>
                ) : (
                  <div className="eq-loan empty">
                    {it.status === 'repair' ? '维修中，暂不可借' : it.status === 'retired' ? '已停用' : '在库可借'}
                  </div>
                )}

                <div className="eq-actions">
                  {it.status === 'lent' ? (
                    <button
                      className="eq-btn primary"
                      onClick={() => {
                        setReturnTarget(it)
                        setReturnForm({ condition: '', toRepair: false })
                      }}
                    >
                      归还
                    </button>
                  ) : it.status === 'in_stock' ? (
                    <button
                      className="eq-btn primary"
                      onClick={() => {
                        setLendTarget(it)
                        setLendForm({ borrower: '', dueAt: '', condition: '' })
                      }}
                    >
                      借出
                    </button>
                  ) : (
                    <button className="eq-btn" disabled>
                      {it.status === 'repair' ? '维修中' : '已停用'}
                    </button>
                  )}
                  <button className="eq-btn" onClick={() => openHistory(it)}>
                    记录
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 借出 */}
      {lendTarget && (
        <div className="mask" onClick={() => setLendTarget(null)}>
          <form className="dlg" style={{ width: 420 }} onClick={(e) => e.stopPropagation()} onSubmit={doLend}>
            <div className="dlg-head">
              <h3>借出 {lendTarget.code}</h3>
              <button type="button" className="tt-close" onClick={() => setLendTarget(null)}>
                ×
              </button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                借用人
                <input
                  list="student-names"
                  value={lendForm.borrower}
                  onChange={(e) => setLendForm({ ...lendForm, borrower: e.target.value })}
                  placeholder="学生姓名或同事名字"
                />
                <datalist id="student-names">
                  {students.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </label>
              <label>
                预计归还（可留空）
                <input
                  type="datetime-local"
                  value={lendForm.dueAt}
                  onChange={(e) => setLendForm({ ...lendForm, dueAt: e.target.value })}
                />
              </label>
              <label>
                借出时机况（可留空）
                <input
                  value={lendForm.condition}
                  onChange={(e) => setLendForm({ ...lendForm, condition: e.target.value })}
                  placeholder="例如 桨叶完好"
                />
              </label>
            </div>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setLendTarget(null)}>
                取消
              </button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '保存中…' : '确认借出'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 归还 */}
      {returnTarget && (
        <div className="mask" onClick={() => setReturnTarget(null)}>
          <form className="dlg" style={{ width: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={doReturn}>
            <div className="dlg-head">
              <h3>归还 {returnTarget.code}</h3>
              <button type="button" className="tt-close" onClick={() => setReturnTarget(null)}>
                ×
              </button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                归还时机况（可留空）
                <input
                  value={returnForm.condition}
                  onChange={(e) => setReturnForm({ ...returnForm, condition: e.target.value })}
                  placeholder="例如 正常 / 桨叶有磕碰"
                />
              </label>
              <label className="ck-inline">
                <input
                  type="checkbox"
                  checked={returnForm.toRepair}
                  onChange={(e) => setReturnForm({ ...returnForm, toRepair: e.target.checked })}
                />
                归还后转入维修
              </label>
            </div>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setReturnTarget(null)}>
                取消
              </button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '保存中…' : '确认归还'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 添加 */}
      {showAdd && (
        <div className="mask" onClick={() => setShowAdd(false)}>
          <form className="dlg" style={{ width: 400 }} onClick={(e) => e.stopPropagation()} onSubmit={doAdd}>
            <div className="dlg-head">
              <h3>添加器材</h3>
              <button type="button" className="tt-close" onClick={() => setShowAdd(false)}>
                ×
              </button>
            </div>
            <div className="dlg-body" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                编号
                <input
                  value={addForm.code}
                  onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
                  placeholder="例如 UAV-006"
                  required
                />
              </label>
              <label>
                型号（可留空）
                <input
                  value={addForm.model}
                  onChange={(e) => setAddForm({ ...addForm, model: e.target.value })}
                  placeholder="例如 DJI Mini 4K"
                />
              </label>
            </div>
            <div className="dlg-foot">
              <button type="button" className="pill small" onClick={() => setShowAdd(false)}>
                取消
              </button>
              <button type="submit" className="pill small dark" disabled={busy}>
                {busy ? '保存中…' : '添加'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 历史 */}
      {historyTarget && (
        <div className="mask" onClick={() => setHistoryTarget(null)}>
          <div className="dlg" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <h3>{historyTarget.code} 的借还记录</h3>
              <button type="button" className="tt-close" onClick={() => setHistoryTarget(null)}>
                ×
              </button>
            </div>
            <div className="eq-history">
              {history.length === 0 && <div className="st-empty">还没有记录</div>}
              {history.map((l) => (
                <div className="eq-hrow" key={l.id}>
                  <span className={`eq-hdot${l.returned_at ? ' back' : ''}`} />
                  <div>
                    <b>{l.borrower_name}</b>
                    <small>
                      {l.lent_at.slice(0, 16)} 借出
                      {l.returned_at ? ` · ${l.returned_at.slice(0, 16)} 归还` : ' · 未归还'}
                    </small>
                    {(l.condition_out || l.condition_in) && (
                      <em>
                        {l.condition_out ? `借出：${l.condition_out}` : ''}
                        {l.condition_in ? `　归还：${l.condition_in}` : ''}
                      </em>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {flash && <div className="st-flash">{flash}</div>}
    </div>
  )
}
