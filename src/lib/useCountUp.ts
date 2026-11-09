import { useEffect, useRef } from 'react'

/** 数字进入时从 0 滚动到目标值（约 600ms，缓出） */
export function useCountUp(target: number, duration = 600) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = format(target)
      return
    }

    const start = performance.now()
    const from = 0
    let raf = 0
    const node = el

    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      const val = from + (target - from) * eased
      node.textContent = format(val)
      if (t < 1) raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return ref
}

function format(n: number): string {
  // 计数场景（节、人次）都应是整数；滚动中间态也保持整数，避免出现 "3.8 节课"
  return String(Math.round(n))
}
