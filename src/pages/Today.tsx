import { useEffect, useState } from 'react'
import { api, type TodayData } from '../lib/api'
import { Figure, Uav } from '../components/Glyphs'
import { useAuth } from '../lib/auth'
import { useTilt } from '../lib/useTilt'
import { useCountdown } from '../lib/useCountdown'
import { useCurrentSessions } from '../lib/useCurrentSessions'
import RollNum from '../components/RollNum'
import ConsumeModal from '../components/ConsumeModal'

const LOW_THRESHOLD = 3

function useToday() {
  const [data, setData] = useState<TodayData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<TodayData>('/today')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '加载失败'))
  }, [])
  return { data, error }
}

function Seats({ students }: { students: Array<{ id: number; name: string; balance: number }> }) {
  const shown = students.slice(0, 9)
  const empties = Math.max(0, 9 - shown.length)
  return (
    <div className="seats">
      {shown.map((s) => (
        <div className="seat" key={s.id}>
          <span className={`tag${s.balance <= LOW_THRESHOLD ? ' low' : ''}`}>
            {s.name} <b>{s.balance}</b>
          </span>
          <Figure />
          <span className="desk" />
        </div>
      ))}
      {Array.from({ length: empties }).map((_, i) => (
        <div className="seat empty" key={`e${i}`}>
          <span className="placeholder" />
          <span className="desk" />
        </div>
      ))}
    </div>
  )
}

function CourseTitle({ course }: { course: { className: string; courseName: string } | undefined }) {
  if (!course) return <span className="rname">主讲教室</span>
  return (
    <span className="course-stage" key={`${course.className}-${course.courseName}`}>
      <span className="rname course-in">{course.className}</span>
      <span className="course-sub course-in2">{course.courseName}</span>
    </span>
  )
}

function NextCard({ second }: { second: { start: string; courseName: string; className: string } }) {
  const { text, urgent } = useCountdown(second.start)
  return (
    <div className="nextcard">
      <span className="nc-t">NEXT</span>
      <span className="nc-b">
        {second.start}　{second.courseName} · {second.className}
      </span>
      {text && (
        <span className={`countdown${urgent ? ' urgent' : ''}`}>
          距上课还有 {text}
        </span>
      )}
    </div>
  )
}

function TiltRoom({
  className,
  children,
  tilt = 2,
}: {
  className: string
  children: React.ReactNode
  tilt?: number
}) {
  const ref = useTilt<HTMLDivElement>(tilt)
  return (
    <div ref={ref} className={`room-tilt ${className}`}>
      <span className="room-glare" aria-hidden="true" />
      {children}
    </div>
  )
}

export default function Today() {
  const { user } = useAuth()
  const { data, error } = useToday()
  const { current, next } = useCurrentSessions(data?.sessions)
  const [consumeSession, setConsumeSession] = useState<{
    id: number
    classId: number
    courseName: string
    className: string
  } | null>(null)
  const [flash, setFlash] = useState('')

  if (error) {
    return (
      <div className="loading">
        <div>
          <p>{error}</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>后端没连上？确认 npm run dev 已经启动。</p>
        </div>
      </div>
    )
  }
  if (!data) return <div className="loading">加载中…</div>

  // 当前课程：按实时时间算，正在进行的那节；没有进行中的就取第一堂未取消课
  const focus = current ?? data.sessions.find((s) => s.status !== 'cancelled') ?? data.sessions[0]
  const second = next
  const [y, m, d] = data.date.split('-')
  const seatStudents = data.classStudents
  const outItems = data.equipment.items.filter((e) => e.status !== 'in_stock')
  const shelfItems = [...data.equipment.items].slice(0, 6)

  return (
    <>
      <div className="canvas">
        <div className="rooms">
          {/* 教室 A */}
          <TiltRoom className={`room a blue${focus && focus.status !== 'cancelled' ? ' sel' : ''}`} tilt={2}>
            <div className="room-head">
              <CourseTitle course={focus ? { className: focus.className, courseName: focus.courseName } : undefined} />
              {current && focus?.status === 'planned' && <span className="live live-on">进行中</span>}
              {focus?.status === 'done' && <span className="live">已下课</span>}
              {focus?.status === 'planned' && !current && <span className="live">待上课</span>}
              <span className="rbar">
                <i style={{ width: `${Math.min(100, (seatStudents.length / 9) * 100)}%` }} />
              </span>
            </div>
            {focus && focus.status !== 'cancelled' && focus.status !== 'done' && (
              <button
                className="room-consume"
                onClick={() =>
                  setConsumeSession({
                    id: focus.id,
                    classId: focus.classId,
                    courseName: focus.courseName,
                    className: focus.className,
                  })
                }
              >
                消课
              </button>
            )}
            <div className="board" />
            <div className="tzone">
              <span className="tz-name">{user?.displayName || '老师'}</span>
              <Figure size={34} />
              <span className="tz-desk" />
            </div>
            <Seats students={seatStudents} />
            <span className="shelfbox" style={{ left: 12, top: 38 }} />
            <span className="cooler" style={{ right: 14, bottom: 14 }} />
            <span className="plant" style={{ left: 14, bottom: 14 }} />
          </TiltRoom>

          {/* 器材间 */}
          <TiltRoom className="room c cream">
            <div className="room-head">
              <span className="rname">器材间</span>
              <span className="rmeta">{data.equipment.inStock} 在库</span>
            </div>
            <div className="shelf">
              <div className="shelf-row">
                {shelfItems.slice(0, 3).map((e) => (
                  <span className={`ucell${e.status !== 'in_stock' ? ' out' : ''}`} key={e.id}>
                    <Uav dim={e.status !== 'in_stock'} />
                    <i>{e.code.replace('UAV-', '')}</i>
                  </span>
                ))}
              </div>
              <div className="plank" />
              <div className="shelf-row">
                {shelfItems.slice(3, 6).map((e) => (
                  <span className={`ucell${e.status !== 'in_stock' ? ' out' : ''}`} key={e.id}>
                    <Uav dim={e.status !== 'in_stock'} />
                    <i>{e.code.replace('UAV-', '')}</i>
                  </span>
                ))}
                {Array.from({ length: Math.max(0, 6 - shelfItems.length) }).map((_, i) => (
                  <span className="ucell out" key={`empty${i}`}>
                    <Uav dim />
                    <i>空位</i>
                  </span>
                ))}
              </div>
              <div className="plank" />
            </div>
            <span className="rack-label">
              借出 {data.equipment.lent} · 维修 {data.equipment.repair}
            </span>
            <span className="plant" style={{ right: 14, top: 44 }} />
          </TiltRoom>

          {/* 前台 */}
          <TiltRoom className="room d pink">
            <div className="room-head">
              <span className="rname">前台</span>
              <span className="rmeta">接待</span>
            </div>
            <div className="worker" style={{ left: 34, bottom: 62 }}>
              <span className="tag">助教</span>
              <Figure />
            </div>
            <span className="clock" />
            <div className="front-desk" />
            <div className="mat" />
            <span className="plant" style={{ left: 14, top: 40 }} />
          </TiltRoom>

          {/* 走廊 */}
          <TiltRoom className="room e gray">
            <div className="room-head">
              <span className="rname">走廊 · 休息区</span>
              <span className="rmeta">
                {second ? `下一节 ${second.start}` : '今天没有后续课程'}
              </span>
            </div>
            {second && <NextCard second={second} />}
            <div className="bench2" />
            <span className="chair" style={{ right: 184, bottom: 64 }} />
            <span className="chair" style={{ right: 210, bottom: 64 }} />
            <span className="plant" style={{ right: 22, bottom: 12 }} />
            <span className="cooler" style={{ left: 16, bottom: 14 }} />
          </TiltRoom>
        </div>
      </div>

      {/* 右侧面板 */}
      <aside className="panel">
        <div className="p-date">今天</div>
        <div className="p-day">
          {Number(m)} 月 {Number(d)} 日　{data.weekday}
        </div>

        <div className="stats">
          <div>
            <RollNum value={data.stats.sessions} />
            <span>节课</span>
          </div>
          <div>
            <RollNum value={data.stats.attendances} />
            <span>人次</span>
          </div>
          <div>
            <RollNum value={data.stats.lowBalance} style={{ color: 'var(--alert)' }} />
            <span>待续费</span>
          </div>
        </div>

        <div className="p-title">
          今日课程 <i />
        </div>
        {data.sessions.length === 0 && (
          <div className="arow" style={{ color: 'var(--ink-3)' }}>
            今天没有排课
          </div>
        )}
        {data.sessions.map((s) => (
          <div className="lesson" key={s.id}>
            <span className={`dot${s.status === 'planned' ? ' hollow' : ''}`} />
            <span className="tm">{s.start}</span>
            <span className="nm" style={s.status === 'cancelled' ? { color: 'var(--ink-3)' } : undefined}>
              {s.courseName} · {s.className}
              <small>
                {s.room ?? '—'}
                {s.status === 'done' && ` · ${s.present} 人 · 已消课`}
                {s.status === 'planned' && ` · ${s.present} 人 · 未开始`}
                {s.status === 'cancelled' && ' · 停课'}
              </small>
            </span>
          </div>
        ))}

        <div className="p-title">
          待处理 <i />
        </div>
        <div className="arow">
          <span className="n">{data.stats.lowBalance}</span> 人课时不足
          <span className="badge" style={{ marginLeft: 'auto' }}>
            ≤ {LOW_THRESHOLD} 节
          </span>
        </div>
        <div className="arow">
          <span className="n">{data.lentLoans.length}</span> 台器材未交回
          {data.lentLoans.length > 0 && <span className="eq-dot" style={{ marginLeft: 6 }} />}
          {data.lentLoans[0] && (
            <span className="badge amber" style={{ marginLeft: 'auto' }}>
              {data.lentLoans[0].code}
            </span>
          )}
        </div>
        <div className="arow" style={{ borderBottom: 0 }}>
          <span className="n">{data.expiring}</span> 人课时 30 天内到期
        </div>

        <div className="p-title">
          本周消课 <i />
          <span style={{ fontFamily: 'var(--mono)' }}>{data.stats.attendances} 节</span>
        </div>
        <div className="spark">
          {[16, 22, 13, 27, 36, 9, 6].map((h, i) => (
            <i key={i} className={i === 4 ? 'hi' : ''} style={{ height: h }} />
          ))}
        </div>

        <div className="p-title">
          器材 <i />
        </div>
        <div className="arow" style={{ borderBottom: 0, fontSize: 11.5, color: 'var(--ink-2)' }}>
          共 {data.equipment.total} 台 · 在库 {data.equipment.inStock} · 借出 {data.equipment.lent}
          {data.equipment.repair > 0 && ` · 维修 ${data.equipment.repair}`}
        </div>
        {outItems.length > 0 && (
          <div className="arow" style={{ borderBottom: 0, fontSize: 11, color: 'var(--ink-3)' }}>
            {outItems.map((e) => `${e.code}${e.status === 'lent' ? ' 借出' : ' 维修'}`).join('　')}
          </div>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--ink-3)', margin: '10px 0 0', lineHeight: 1.7 }}>
          第 {data.week} 周 · 演示数据，M1 起可编辑
        </p>
      </aside>

      <ConsumeModal
        session={consumeSession}
        onClose={() => setConsumeSession(null)}
        onDone={(msg) => {
          setConsumeSession(null)
          setFlash(msg)
          setTimeout(() => setFlash(''), 2600)
          // 消课后刷新今日数据
          api<TodayData>('/today').then((d) => window.location.reload())
        }}
      />

      {flash && <div className="st-flash">{flash}</div>}
    </>
  )
}
