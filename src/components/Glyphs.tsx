/** 全局 SVG 符号：小人剪影 + 无人机 */
export function GlyphDefs() {
  return (
    <svg style={{ display: 'none' }} aria-hidden="true">
      <symbol id="fig" viewBox="0 0 48 48">
        {/* 身体：稍浅的主块 */}
        <path d="M6.5 45c0-9.8 7.8-17.4 17.5-17.4S41.5 35.2 41.5 45z" fill="#1E1E1E" />
        {/* 肩线：一道细高光，避免变成纯黑块 */}
        <path
          d="M7.4 44.4c.7-9 8-16.2 16.6-16.2s15.9 7.2 16.6 16.2"
          fill="none"
          stroke="#3A3A3A"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        {/* 头 */}
        <circle cx="24" cy="14" r="8.3" fill="#232323" />
        {/* 头的左上高光 */}
        <circle cx="20.8" cy="10.8" r="2.7" fill="#5A5A5A" opacity="0.38" />
        {/* 两侧手臂 */}
        <circle cx="8.6" cy="38.5" r="4.5" fill="#282828" />
        <circle cx="39.4" cy="38.5" r="4.5" fill="#282828" />
      </symbol>
      <symbol id="uav" viewBox="0 0 24 24">
        <path d="M12 12 6 6M12 12 18 6M12 12 6 18M12 12 18 18" stroke="#4A473F" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="6" cy="6" r="3.3" fill="#2F2C26" />
        <circle cx="18" cy="6" r="3.3" fill="#2F2C26" />
        <circle cx="6" cy="18" r="3.3" fill="#2F2C26" />
        <circle cx="18" cy="18" r="3.3" fill="#2F2C26" />
        <circle cx="6" cy="6" r="1" fill="#fff" />
        <circle cx="18" cy="6" r="1" fill="#fff" />
        <circle cx="6" cy="18" r="1" fill="#fff" />
        <circle cx="18" cy="18" r="1" fill="#fff" />
        <rect x="9" y="9" width="6" height="6" rx="1.8" fill="#2F2C26" />
        <circle cx="12" cy="12" r="1.2" fill="#fff" />
      </symbol>
    </svg>
  )
}

export function Figure({ size, dim }: { size?: number; dim?: boolean }) {
  return (
    <svg className="fig" width={size} height={size} style={dim ? { opacity: 0.35 } : undefined}>
      <use href="#fig" />
    </svg>
  )
}

export function Uav({ size, dim }: { size?: number; dim?: boolean }) {
  return (
    <svg className="uav" width={size} height={size} style={dim ? { opacity: 0.35 } : undefined}>
      <use href="#uav" />
    </svg>
  )
}
