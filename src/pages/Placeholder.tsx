import { Figure } from '../components/Glyphs'

export default function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="placeholder-page">
      <div className="placeholder-inner">
        <Figure size={54} dim />
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
    </div>
  )
}
