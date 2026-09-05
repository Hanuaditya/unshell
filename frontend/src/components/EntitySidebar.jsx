const RISK_ORDER = { CRITICAL: 0, HIGH_RISK: 1, MEDIUM_RISK: 2, AUTO_APPROVE: 3 }

const RISK_DOT = {
  CRITICAL:     { color: '#FC8181', bg: 'rgba(197,48,48,0.15)',  border: 'rgba(197,48,48,0.4)'  },
  HIGH_RISK:    { color: '#C084FC', bg: 'rgba(124,58,237,0.15)', border: 'rgba(124,58,237,0.4)' },
  MEDIUM_RISK:  { color: '#FB923C', bg: 'rgba(194,65,12,0.15)',  border: 'rgba(194,65,12,0.4)'  },
  AUTO_APPROVE: { color: '#34D399', bg: 'rgba(4,120,87,0.15)',   border: 'rgba(4,120,87,0.4)'   },
}

const FILTERS = [
  { key: 'LOOP',    label: 'Circular Loops', activeBg: 'rgba(197,48,48,0.2)',   activeBorder: 'rgba(197,48,48,0.5)',   activeText: '#FC8181'  },
  { key: 'OFFSHORE',label: 'Offshore',        activeBg: 'rgba(29,78,216,0.2)',   activeBorder: 'rgba(29,78,216,0.5)',   activeText: '#93C5FD'  },
  { key: 'PUPPET',  label: 'Puppets',         activeBg: 'rgba(194,65,12,0.2)',   activeBorder: 'rgba(194,65,12,0.5)',   activeText: '#FDBA74'  },
  { key: 'OFAC',    label: 'OFAC Match',      activeBg: 'rgba(127,0,0,0.3)',     activeBorder: 'rgba(197,48,48,0.5)',   activeText: '#FCA5A5'  },
]

function StatMini({ label, value, valueColor }) {
  return (
    <div style={{
      background: 'var(--white)', border: '1px solid var(--border-light)', borderRadius: 10,
      padding: '7px 10px', textAlign: 'center', boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div style={{ color: valueColor || 'var(--text-dark)', fontSize: 16, fontWeight: 700 }}>{value ?? '—'}</div>
    </div>
  )
}

export default function EntitySidebar({ nodes = [], stats, resolvedUbo = '', activeFilters = [], fatalFlags = [], cumulativeVectors = [], onFilterChange, onEntityClick }) {
  const sorted = [...nodes].sort((a, b) => (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9))

  function toggle(key) {
    onFilterChange(activeFilters.includes(key) ? activeFilters.filter(f => f !== key) : [...activeFilters, key])
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--cream-2)',
      borderRight: '1px solid var(--border-light)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Stats */}
      {stats && (
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <StatMini label="Loops"    value={stats.loops_detected}     valueColor={stats.loops_detected    > 0 ? '#FC8181' : undefined} />
            <StatMini label="Puppets"  value={stats.puppets_detected}   valueColor={stats.puppets_detected  > 0 ? '#FDBA74' : undefined} />
            <StatMini label="Entities" value={stats.total_entities} />
            <StatMini label="Depth"    value={stats.investigation_depth} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid var(--border-light)', flexShrink: 0 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>Filter</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {FILTERS.map(f => {
            const active = activeFilters.includes(f.key)
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                style={{
                  background: active ? f.activeBg : 'transparent',
                  border: `1px solid ${active ? f.activeBorder : 'var(--border-light)'}`,
                  color: active ? f.activeText : 'var(--text-muted)',
                  fontSize: 11, fontWeight: 500,
                  padding: '5px 12px', borderRadius: 9999,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.18s ease',
                  fontFamily: 'inherit',
                  letterSpacing: '0.01em',
                  background: active ? f.activeBg : 'var(--white)',
                  boxShadow: active ? 'none' : 'var(--shadow-sm)',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--text-dark)'; e.currentTarget.style.borderColor = 'var(--text-muted)' } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-light)' } }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rejection / Risk Rationale */}
      {(fatalFlags?.length > 0 || cumulativeVectors?.length > 0) && (
        <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid var(--border-light)', flexShrink: 0, background: 'rgba(0,0,0,0.03)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>Rejection Rationale</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fatalFlags?.map(flag => (
              <div key={flag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#FC8181', fontWeight: 600 }}>{flag.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 10, color: '#C53030', fontWeight: 700, background: 'rgba(197,48,48,0.2)', padding: '1px 6px', borderRadius: 4 }}>FATAL</span>
              </div>
            ))}
            {cumulativeVectors?.map((vec, i) => {
              // vec can be a string OR an object {flag, impact, evidence}
              const isObj  = vec && typeof vec === 'object'
              const flag   = isObj ? (vec.flag || '') : String(vec)
              const label  = flag.replace(/_/g, ' ')
              const impact = isObj
                ? (vec.impact != null ? `+${vec.impact}` : '+?')
                : ({ LIQUIDATION_STATUS: '+30', ACCOUNTS_OVERDUE: '+20', CORPORATE_DIRECTOR: '+15',
                     HIGH_OFFICER_TURNOVER: '+10', AGED_SHELL: '+35', VAGUE_SIC: '+15',
                     BOILER_ROOM: '+40', SMURF_NETWORK: '+25' }[flag] || '+15')
              return (
                <div key={flag + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dark)' }}>{label}</span>
                  <span style={{ fontSize: 10, color: '#C05621', fontWeight: 700, background: 'rgba(221,107,32,0.15)', padding: '1px 6px', borderRadius: 4 }}>{impact}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Entity list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{
          color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em',
          padding: '10px 12px 7px',
          position: 'sticky', top: 0, background: 'var(--cream-2)', zIndex: 1,
          borderBottom: '1px solid var(--border-light)',
        }}>
          Entities ({nodes.length})
        </div>

        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {sorted.map(node => {
            const risk = RISK_DOT[node.risk_level] || { color: '#625C52', bg: 'transparent', border: 'transparent' }
            const hasOFAC   = node.tags?.includes('OFAC')
            const hasPuppet = node.tags?.includes('PUPPET')
            const isUBO     = resolvedUbo && node.label?.toLowerCase() === resolvedUbo.toLowerCase()
            const badge = hasOFAC
              ? { text: 'OFAC',   color: '#FCA5A5', bg: 'rgba(127,0,0,0.25)',    border: 'rgba(197,48,48,0.4)' }
              : hasPuppet
              ? { text: 'PUPPET', color: '#FDBA74', bg: 'rgba(194,65,12,0.2)',   border: 'rgba(194,65,12,0.4)' }
              : isUBO
              ? { text: 'UBO',    color: '#34D399', bg: 'rgba(4,120,87,0.18)',   border: 'rgba(4,120,87,0.4)' }
              : null

            return (
              <div
                key={node.id}
                onClick={() => onEntityClick(node.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--white)'
                  e.currentTarget.style.borderColor = 'var(--border-light)'
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'transparent'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Risk dot */}
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: risk.color, flexShrink: 0,
                  boxShadow: `0 0 5px ${risk.color}60`,
                }} />

                {/* Name + jurisdiction */}
                <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                  <div style={{ color: 'var(--text-dark)', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.label}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9.5, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.jurisdiction}
                  </div>
                </div>

                {/* Badge or score */}
                {badge && (
                  <span style={{
                    background: badge.bg, color: badge.color,
                    border: `1px solid ${badge.border}`,
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                    padding: '2px 7px', borderRadius: 9999, flexShrink: 0,
                  }}>
                    {badge.text}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
