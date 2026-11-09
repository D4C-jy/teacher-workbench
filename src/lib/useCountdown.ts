import { useEffect, useState } from 'react'

/**
 * 实时倒计时，返回距目标时刻的「HH:MM:SS」以及是否临近（<15 分钟）。
 * 传入 null 时不启动。
 */
export function useCountdown(target: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return
    const t = Date.now()
    // 每秒对齐到整秒，减少漂移
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])

  if (!target) return { text: null, urgent: false }

  const [h, m] = target.split(':').map(Number)
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0)
  const diff = Math.max(0, end.getTime() - now)

  if (diff <= 0) return { text: '00:00', urgent: false }

  const s = Math.floor(diff / 1000)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return { text: `${hh}:${mm}:${ss}`, urgent: diff < 15 * 60 * 1000 }
}
