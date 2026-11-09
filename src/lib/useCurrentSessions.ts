import { useEffect, useMemo, useState } from 'react'

interface SessionLike {
  id: number
  start: string
  end: string
  status: 'planned' | 'done' | 'cancelled'
}

/** 把 "HH:MM" 转成当天分钟数 */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * 根据电脑实时时间，从当天课表里算出「当前课程」和「下一节」。
 * 每 30 秒 tick 一次，跨过下课时间点会自动切换。
 * 泛型 T 保持传入元素类型原样返回（含 courseName 等字段）。
 */
export function useCurrentSessions<T extends SessionLike>(sessions: T[] | undefined) {
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })

  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 30 * 1000)
    return () => clearInterval(id)
  }, [])

  return useMemo(() => {
    if (!sessions || sessions.length === 0) return { current: undefined as T | undefined, next: undefined as T | undefined }

    const active = sessions.filter((s) => s.status !== 'cancelled')

    // 当前：start <= now < end，且未下课
    const current = active.find((s) => {
      const st = toMin(s.start)
      const en = toMin(s.end)
      return s.status !== 'done' && nowMin >= st && nowMin < en
    })

    // 下一节：now 之后最近的 planned 课（排除当前）
    const upcoming = active
      .filter((s) => s.id !== current?.id && s.status === 'planned' && toMin(s.start) > nowMin)
      .sort((a, b) => toMin(a.start) - toMin(b.start))

    return { current, next: upcoming[0] }
  }, [sessions, nowMin])
}
