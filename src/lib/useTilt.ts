import { useEffect, useRef } from 'react'

/**
 * 给元素加「跟随鼠标的 3D 倾斜 + 径向反光」动效。
 *
 * 用法：把 ref 挂到房间容器上，房间内部放一个 <span class="room-glare" /> 作为反光层。
 * 松手后由 CSS 的 cubic-bezier 过渡回正（带一点回弹）。
 *
 * 只在支持 hover 的指针设备上启用；触屏设备自动跳过。
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(maxDeg = 3) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // 触屏设备没有 hover，跳过
    if (window.matchMedia('(hover: none)').matches) return

    // 关闭 TS 对闭包内 el 的空值推断（上方已判空）
    const node = el as T

    let raf = 0

    function onMove(e: MouseEvent) {
      const r = node.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width // 0~1
      const py = (e.clientY - r.top) / r.height
      const rx = (0.5 - py) * maxDeg // 上下：鼠标在上 → 上翘
      const ry = (px - 0.5) * maxDeg // 左右：鼠标在右 → 右转

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        node.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`

        // 反光跟着鼠标走
        const glare = node.querySelector<HTMLElement>('.room-glare')
        if (glare) {
          glare.style.background = `radial-gradient(circle at ${px * 100}% ${py * 100}%, rgba(255,255,255,.85), rgba(255,255,255,0) 55%)`
        }
      })
    }

    function onLeave() {
      cancelAnimationFrame(raf)
      node.style.transform = '' // 交给 CSS 过渡回正
    }

    node.addEventListener('mousemove', onMove)
    node.addEventListener('mouseleave', onLeave)
    return () => {
      node.removeEventListener('mousemove', onMove)
      node.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [maxDeg])

  return ref
}
