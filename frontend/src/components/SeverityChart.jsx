const COLORS = [
  'var(--faint)',
  'var(--blue)',
  'var(--blue)',
  'var(--amber)',
  'var(--orange)',
  'var(--red)',
]

export default function SeverityChart({ hist }) {
  const data = Array.isArray(hist) && hist.length === 6 ? hist : [0, 0, 0, 0, 0, 0]
  const max = Math.max(1, ...data)

  return (
    <div className="chart">
      <div className="chart__bars">
        {data.map((v, i) => (
          <div className="chart__col" key={i}>
            <div
              className="chart__bar"
              style={{ height: `${(v / max) * 100}%`, background: COLORS[i] }}
              title={`severity ${i}: ${v}`}
            >
              <span className="chart__val">{v}</span>
            </div>
            <span className="chart__tick">{i}</span>
          </div>
        ))}
      </div>
      <div className="chart__axis">severity 0 → 5</div>
    </div>
  )
}
