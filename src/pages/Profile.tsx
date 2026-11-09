import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

interface Stats {
  month: string
  lessons: number
  revenue: number
  sessions: number
  attendance: { present: number; expected: number; rate: number }
  renewals: { renewed: number; total: number; rate: number }
  daily: Array<{ d: string; v: number }>
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Profile() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (m: string) => {
    try {
      const d = await api<Stats>(`/stats/monthly?month=${m}`)
      setData(d)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    load(month)
  }, [month, load])

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m, 0).getDate()
  }, [month])

  const maxV = Math.max(1, ...(data?.daily.map((d) => d.v) ?? [1]))

  if (error) return <div className="loading">{error}</div>
  if (!data) return <div className="loading">加载中…</div>

  const [y, m] = data.month.split('-')

  return (
    <div className="pf-wrap">
      <header className="pf-head">
        <div>
          <h1>个人中心</h1>
          <p>每月到课率、续费率、上课课时与业绩，都从流水和课次直接算出来。</p>
        </div>
        <div className="pf-month">
          <button className="pill small" onClick={() => setMonth(shiftMonth(month, -1))}>
            ←
          </button>
          <b>
            {y} 年 {Number(m)} 月
          </b>
          <button className="pill small" onClick={() => setMonth(shiftMonth(month, 1))}>
            →
          </button>
        </div>
      </header>

      <div className="pf-cards">
        <div className="pf-card">
          <span className="pf-label">总上课课时</span>
          <div className="pf-num">
            {data.lessons}
            <small>节</small>
          </div>
          <span className="pf-sub">本月完成 {data.sessions} 节课</span>
        </div>

        <div className="pf-card">
          <span className="pf-label">到课率</span>
          <div className="pf-num">
            {data.attendance.rate}
            <small>%</small>
          </div>
          <div className="pf-bar">
            <i style={{ width: `${Math.min(100, data.attendance.rate)}%` }} />
          </div>
          <span className="pf-sub">
            实到 {data.attendance.present} / 应到 {data.attendance.expected} 人次
          </span>
        </div>

        <div className="pf-card">
          <span className="pf-label">续费率</span>
          <div className="pf-num">
            {data.renewals.rate}
            <small>%</small>
          </div>
          <div className="pf-bar">
            <i style={{ width: `${Math.min(100, data.renewals.rate)}%` }} />
          </div>
          <span className="pf-sub">
            本月续费 {data.renewals.renewed} / 应续费 {data.renewals.total} 人
          </span>
        </div>

        <div className="pf-card">
          <span className="pf-label">业绩金额</span>
          <div className="pf-num">
            <span className="pf-yen">¥</span>
            {data.revenue.toLocaleString('zh-CN')}
          </div>
          <span className="pf-sub">本月充值合计</span>
        </div>
      </div>

      <section className="pf-chart">
        <div className="pf-chart-head">
          <b>每日消课</b>
          <span>单位：节</span>
        </div>
        <div className="pf-bars">
          {Array.from({ length: days }, (_, i) => {
            const day = String(i + 1).padStart(2, '0')
            const key = `${month}-${day}`
            const rec = data.daily.find((d) => d.d === key)
            const v = rec?.v ?? 0
            return (
              <div className="pf-bar-col" key={key} title={`${Number(day)} 日：${v} 节`}>
                <div className="pf-bar-v" style={{ height: `${(v / maxV) * 100}%` }} />
                <span>{Number(day) % 5 === 0 ? Number(day) : ''}</span>
              </div>
            )
          })}
        </div>
      </section>

      <p className="pf-foot">
        到课率 = 本月实到人次 ÷ 应到人次（按课次数 × 班级人数）；续费率 = 本月续费人数 ÷ 本月应续费人数（余额低于 10 课时的学员）。
        数据全部来自课时流水与课次记录，没有手工填写的数字。
      </p>
    </div>
  )
}
