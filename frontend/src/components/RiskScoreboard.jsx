import { getRiskColor } from '../constants/riskColors'

const RISK_BANNER = {
  CRITICAL:     { bg: 'linear-gradient(90deg, rgba(197,48,48,0.1) 0%, var(--white) 100%)', border: '#C53030', pulseClass: 'border-pulse-critical' },
  HIGH_RISK:    { bg: 'linear-gradient(90deg, rgba(107,70,193,0.1) 0%, var(--white) 100%)', border: '#6B46C1', pulseClass: 'border-pulse-high' },
  MEDIUM_RISK:  { bg: 'linear-gradient(90deg, rgba(214,158,46,0.1) 0%, var(--white) 100%)', border: '#D69E2E', pulseClass: '' },
  AUTO_APPROVE: { bg: 'linear-gradient(90deg, rgba(56,161,105,0.1) 0%, var(--white) 100%)', border: '#38A169', pulseClass: '' },
}

export default function RiskScoreboard({
  riskScore, riskLabel,
  fatalFlags = [], cumulativeVectors = [],
  sanctionsHit, sanctionsDetail, resolvedUbo,
  confidence = null,  // kept for API compat, not rendered
  compact = false,
  onGenerateSar,
}) {
  const color = getRiskColor(riskLabel)
  const banner = RISK_BANNER[riskLabel] || RISK_BANNER.MEDIUM_RISK
  const scoreDisplay = (riskScore / 10).toFixed(1)

  /* ── COMPACT (top bar) ─────────────────────────────────────────────────── */
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: color.text, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{riskScore}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>/100</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          background: color.bg, color: color.text,
          border: `1px solid ${color.border}`,
          fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
          padding: '3px 10px', borderRadius: 9999,
        }}>
          {riskLabel?.replace(/_/g, ' ')}
        </span>
        {resolvedUbo && (
          <span style={{
            color: 'var(--text-muted)', fontSize: 10,
            display: 'flex', alignItems: 'center', gap: 4,
            borderLeft: '1px solid var(--border-light)', paddingLeft: 10,
            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>UBO</span>
            <span style={{
              color: sanctionsHit ? '#FC8181' : 'var(--text-mid)', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sanctionsHit && '⚠ '}{resolvedUbo}
            </span>
          </span>
        )}
      </div>
    )
  }

  /* ── FULL VERSION (bottom banner) ──────────────────────────────────────── */
  return (
    <div
      className={banner.pulseClass || undefined}
      style={{
        height: 76,
        flexShrink: 0,
        background: banner.bg,
        borderLeft: `3px solid ${banner.border}`,
        borderTop: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Removed S1 as requested by user. */}

      {/* S2: Risk score */}
      <div style={{
        flex: 1, padding: '0 20px', borderRight: '1px solid var(--border-light)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4,
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Risk Score</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ color: color.text, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{riskScore}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>/100</span>
        </div>
      </div>

      {/* S3: Flags */}
      <div style={{
        flex: 1.2, padding: '0 16px', borderRight: '1px solid var(--border-light)',
        display: 'flex', flexDirection: 'column', gap: 5, overflow: 'hidden',
      }}>
        {fatalFlags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 5, overflowX: 'auto' }}>
            {fatalFlags.map((f, i) => {
              const flag = f && typeof f === 'object' ? (f.flag || '') : String(f)
              return (
                <span key={flag + i} style={{
                  background: 'rgba(197,48,48,0.15)', color: '#FC8181',
                  border: '1px solid rgba(197,48,48,0.3)',
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  padding: '2px 9px', borderRadius: 9999, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {flag.replace(/_/g, ' ')}
                </span>
              )
            })}
          </div>
        )}
        {cumulativeVectors.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 5, overflowX: 'auto' }}>
            {cumulativeVectors.map((v, i) => {
              const flag   = v && typeof v === 'object' ? (v.flag || '') : String(v)
              const impact = v && typeof v === 'object' && v.impact != null ? ` +${v.impact}` : ''
              return (
                <span key={flag + i} style={{
                  background: 'var(--white)', color: 'var(--text-mid)',
                  border: '1px solid var(--border-light)',
                  fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                  padding: '2px 9px', borderRadius: 9999, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {flag.replace(/_/g, ' ')}{impact}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* S4: OFAC + UBO */}
      <div style={{ width: 200, flexShrink: 0, padding: '0 18px', overflow: 'hidden' }}>
        {sanctionsHit && (
          <div style={{ marginBottom: resolvedUbo ? 6 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{
                background: 'rgba(127,0,0,0.3)', color: '#FC8181',
                border: '1px solid rgba(197,48,48,0.4)',
                fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
                padding: '2px 8px', borderRadius: 9999,
              }}>⚠ OFAC MATCH</span>
            </div>
            {sanctionsDetail && (
              <div style={{ color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.5 }}>{sanctionsDetail}</div>
            )}
          </div>
        )}
        {resolvedUbo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ color: 'var(--text-dark)', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              UBO: <span style={{ color: 'var(--text-mid)', fontWeight: 500 }}>{resolvedUbo}</span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 8.5, marginTop: 2, lineHeight: 1.3 }}>
              ℹ Calculated via highest Human PSC ownership
            </div>
          </div>
        )}
      </div>

      {/* S5: SAR Button */}
      {!compact && onGenerateSar && (
        <div style={{
          padding: '0 20px', borderLeft: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <button
            onClick={onGenerateSar}
            disabled={riskScore < 65}
            title={riskScore < 65 ? "SAR drafting requires a risk score of 65 or higher." : "Generate a draft Suspicious Activity Report"}
            style={{
              background: riskScore >= 65 ? 'var(--text-dark)' : 'var(--cream-2)',
              color: riskScore >= 65 ? 'var(--white)' : 'var(--text-muted)',
              border: `1px solid ${riskScore >= 65 ? 'transparent' : 'var(--border-light)'}`,
              fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
              cursor: riskScore >= 65 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            Pre-Draft SAR
          </button>
        </div>
      )}
    </div>
  )
}
