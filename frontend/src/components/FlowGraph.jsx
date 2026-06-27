// Read-only animated pipeline graph. Pure render from props; the Flow page
// drives the state over time. Geometry lives here in a fixed SVG viewBox.

const VW = 1180
const VH = 240
const N = 6
const NODE_W = 170
const NODE_H = 92
const GAP = (VW - N * NODE_W) / (N + 1)
const NY = 56
const LINE_Y = NY + NODE_H / 2

const I = {
  prompt: (
    <path d="M5 6l4 4-4 4M11 15h5" />
  ),
  shield: <path d="M10 3l6 2.5V10c0 4.2-6 7-6 7s-6-2.8-6-7V5.5L10 3z" />,
  chip: <path d="M6.5 6.5h7v7h-7zM10 3v3.5M10 13.5V17M3 10h3.5M13.5 10H17" />,
  scan: (
    <>
      <circle cx="9" cy="9" r="4.4" />
      <path d="M12.4 12.4L17 17" />
    </>
  ),
  info: <path d="M10 17a7 7 0 100-14 7 7 0 000 14zM10 9.2v4M10 6.6v.2" />,
  ledger: <path d="M4.5 5h11M4.5 10h11M4.5 15h7" />,
}

export const NODES = [
  { title: 'Incoming Prompt', sub: 'user input', art: null, icon: I.prompt },
  { title: 'Input Detection', sub: 'rules + judge', art: 'Art.15(5)', icon: I.shield },
  { title: 'LLM', sub: 'mock / Regolo', art: null, icon: I.chip },
  { title: 'Output Scan', sub: 'PII / secret', art: 'Art.15(5)', icon: I.scan },
  { title: 'Disclosure', sub: 'AI label', art: 'Art.50', icon: I.info },
  { title: 'Audit Log', sub: 'record-keeping', art: 'Art.12', icon: I.ledger },
]

const nodeX = (i) => GAP + i * (NODE_W + GAP)
const centerX = (i) => nodeX(i) + NODE_W / 2

const ARC_COLOR = { red: 'var(--red)', amber: 'var(--amber)', blue: 'var(--blue)' }
const PACKET_COLOR = { amber: 'var(--amber)', red: 'var(--red)', green: 'var(--green)' }

export default function FlowGraph({ nodeStates, connectors, packet, auditArc }) {
  const packetT = `translate(${centerX(packet.index)}px, ${LINE_Y}px)`

  return (
    <div className="flow-wrap">
      <div className="flow-graph">
        <svg viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label="AEGIS request pipeline">
          <defs>
            <radialGradient id="aegisSpot" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(134,118,255,0.22)" />
              <stop offset="100%" stopColor="rgba(134,118,255,0)" />
            </radialGradient>
          </defs>

          {/* spotlight following the packet */}
          <g
            className={'flow-spot' + (packet.visible ? ' is-on' : '')}
            style={{ transform: packetT }}
          >
            <circle r="130" fill="url(#aegisSpot)" />
          </g>

          {/* main connectors */}
          {Array.from({ length: N - 1 }).map((_, i) => {
            const x1 = nodeX(i) + NODE_W
            const x2 = nodeX(i + 1)
            const st = connectors[i] || 'dim'
            return (
              <path
                key={`c${i}`}
                className={`flow-conn is-${st}`}
                d={`M ${x1} ${LINE_Y} L ${x2} ${LINE_Y}`}
              />
            )
          })}

          {/* audit feeder arc (shown when a node blocks/sanitizes) */}
          {auditArc && (
            <path
              className="flow-arc is-on"
              style={{ stroke: ARC_COLOR[auditArc.color] }}
              d={`M ${centerX(auditArc.from)} ${NY + NODE_H} C ${centerX(auditArc.from)} ${VH - 18}, ${centerX(5)} ${VH - 18}, ${centerX(5)} ${NY + NODE_H}`}
            />
          )}

          {/* nodes */}
          {NODES.map((n, i) => (
            <foreignObject key={i} x={nodeX(i)} y={NY} width={NODE_W} height={NODE_H}>
              <div className={`flow-node is-${nodeStates[i] || 'idle'}`}>
                <div className="flow-node__head">
                  <span className="flow-node__icon">
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      {n.icon}
                    </svg>
                  </span>
                  <div className="flow-node__title">{n.title}</div>
                </div>
                <div className="flow-node__sub mono">{n.sub}</div>
                {n.art && <span className="flow-node__art">⬡ {n.art}</span>}
              </div>
            </foreignObject>
          ))}

          {/* connection ports (drawn over node edges) */}
          {NODES.map((_, i) => (
            <g key={`p${i}`}>
              {i > 0 && <circle className="flow-port" cx={nodeX(i)} cy={LINE_Y} r="4.5" />}
              {i < N - 1 && (
                <circle className="flow-port" cx={nodeX(i) + NODE_W} cy={LINE_Y} r="4.5" />
              )}
            </g>
          ))}

          {/* travelling packet */}
          <g
            className={'flow-packet' + (packet.visible ? '' : ' is-hidden')}
            style={{ transform: packetT }}
          >
            <circle className="flow-packet__halo" r="13" fill={PACKET_COLOR[packet.color]} />
            <circle r="6" fill={PACKET_COLOR[packet.color]} />
          </g>
        </svg>
      </div>
    </div>
  )
}
