import { useCountUp } from '../lib/useCountUp'

/** 数字进入时从 0 滚动到目标值（计数场景，保持整数） */
export default function RollNum({ value, style }: { value: number; style?: React.CSSProperties }) {
  const ref = useCountUp(value)
  return (
    <b ref={ref} className="num-roll" style={style}>
      {value}
    </b>
  )
}
