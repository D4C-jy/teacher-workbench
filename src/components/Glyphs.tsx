/** 全局 SVG 符号：小人剪影 + 无人机 */
export function GlyphDefs() {
  return (
    <svg style={{ display: 'none' }} aria-hidden="true">
      <symbol id="fig" viewBox="0 0 44 44">
        <circle cx="22" cy="12" r="7.6" fill="#1C1C1C" />
        <path d="M5.5 40c0-8.8 7.4-16 16.5-16s16.5 7.2 16.5 16z" fill="#1C1C1C" />
        <circle cx="7.5" cy="35" r="4.2" fill="#1C1C1C" />
        <circle cx="36.5" cy="35" r="4.2" fill="#1C1C1C" />
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
