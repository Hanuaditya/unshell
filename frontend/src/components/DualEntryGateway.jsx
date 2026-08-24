import { useState } from 'react'

/* ─── Tokens ─────────────────────────────────────────────────────────── */
const C = {
  bg:       '#EDEAE1',
  white:    '#FFFFFF',
  border:   'rgba(0,0,0,0.07)',
  borderMd: 'rgba(0,0,0,0.10)',
  ink:      '#0A0A0A',
  inkMid:   '#3A3A3A',
  inkMuted: '#8A8A8A',
  inkFaint: '#BBBBBB',
}

const DEMOS = [
  { label: 'Monzo',   crn: '09446231' },
  { label: 'IBS',     crn: '01683457' },
  { label: 'Seabon',  crn: '06026625' },
]

const CRN_REGEX = /^([A-Z]{2}\d{6}|\d{8})$/i

/* ─── Icons ──────────────────────────────────────────────────────────── */
const Icons = {
  graph: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  ),
  shield: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  lock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="3"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  arrow: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
}

/* ─── Logo ───────────────────────────────────────────────────────────── */
function Logo({ size = 'md' }) {
  const sz = size === 'sm' ? 32 : 36
  const fs = size === 'sm' ? 13 : 14
  const ts = size === 'sm' ? 11 : 12
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: sz, height: sz, borderRadius: '50%',
        background: C.white,
        boxShadow: '0 1px 0 rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs, fontWeight: 800, color: C.ink, flexShrink: 0,
        letterSpacing: '-0.02em',
      }}>U</div>
      <span style={{ fontSize: ts, fontWeight: 700, color: C.ink, letterSpacing: '0.13em' }}>
        UNSHELL
      </span>
    </div>
  )
}

/* ─── Error Modal ────────────────────────────────────────────────────── */
function ErrorModal({ message, onClose }) {
  if (!message) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.20)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: 20, padding: '32px 36px',
        maxWidth: 380, width: '90%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.05)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Invalid CRN</div>
        <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.65, marginBottom: 24 }}>{message}</div>
        <button onClick={onClose} style={{
          background: C.ink, color: '#fff', border: 'none', borderRadius: 99,
          padding: '10px 28px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Got it</button>
      </div>
    </div>
  )
}

/* ─── Main ───────────────────────────────────────────────────────────── */
export default function DualEntryGateway({ onInvestigateAPI, error, onErrorClear }) {
  const [crn, setCrn]         = useState('')
  const [modalErr, setMErr]   = useState(null)
  const [focused, setFocused] = useState(false)

  const displayError = modalErr || error
  const canGo = crn.trim().length > 0

  function go(val) {
    const t = (val ?? crn).trim().toUpperCase()
    if (!t) return
    if (!CRN_REGEX.test(t)) {
      setMErr(`"${t}" is not a valid UK CRN. Expected 8 digits (e.g. 09446231) or 2-letter prefix + 6 digits (e.g. SC123456).`)
      return
    }
    onInvestigateAPI(t)
  }

  const FONT = "-apple-system, 'SF Pro Text', 'Inter', system-ui, sans-serif"

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: FONT, WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .g-fade { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .g-fade-2 { animation: fadeUp 0.5s 0.08s cubic-bezier(0.16,1,0.3,1) both; }
        .demo-chip:hover { background: ${C.ink} !important; color: #fff !important; border-color: ${C.ink} !important; }
        .go-btn:not(:disabled):hover { background: #222 !important; }
        .go-btn:not(:disabled):active { transform: scale(0.98); }
        .feat-row { transition: opacity 0.15s; }
        .feat-row:hover { opacity: 0.75; }
      `}</style>

      <ErrorModal 
        message={displayError} 
        onClose={() => {
          setMErr(null)
          if (onErrorClear) onErrorClear()
        }} 
      />

      {/* ── Top nav bar ──────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 56,
        display: 'flex', alignItems: 'center',
        padding: '0 40px',
        background: 'rgba(237,234,225,0.80)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <Logo />
      </nav>

      {/* ── Main content — centered two-column ───────────────────────── */}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 40px',  // top pad accounts for nav
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          width: '100%',
          maxWidth: 960,
        }}>

          {/* ── LEFT — hero ──────────────────────────────────────────── */}
          <div className="g-fade" style={{ flex: 1, paddingRight: 64 }}>

            {/* Badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: C.white, border: `1px solid ${C.borderMd}`,
              borderRadius: 99, padding: '5px 14px', marginBottom: 28,
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#2DA44E' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, letterSpacing: '0.04em' }}>
                LIVE · UK Companies House
              </span>
            </div>

            {/* Heading */}
            <h1 style={{
              fontSize: 54, fontWeight: 800, color: C.ink,
              lineHeight: 1.0, letterSpacing: '-0.03em', margin: '0 0 6px',
            }}>
              AML &amp; KYB
            </h1>
            <h2 style={{
              fontSize: 46, fontWeight: 300, color: C.inkMid,
              lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 20px',
            }}>
              Intelligence Graph
            </h2>

            <p style={{
              fontSize: 15, color: C.inkMuted, lineHeight: 1.75,
              maxWidth: 380, margin: '0 0 40px',
            }}>
              Autonomously traces corporate ownership chains, detects circular loops, and screens against global sanctions databases — in seconds.
            </p>

            {/* Features */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { Icon: Icons.graph,  label: 'Deep Graph Traversal',  desc: 'Recursively maps 6+ corporate layers' },
                { Icon: Icons.shield, label: 'Real-time Sanctions',   desc: 'OFAC SDN + EU HM Treasury live' },
                { Icon: Icons.lock,   label: 'Zero Data Retention',   desc: 'No PII stored or transmitted' },
              ].map(({ Icon, label, desc }, i) => (
                <div key={label} className="feat-row" style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  padding: '13px 0',
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: C.white,
                    boxShadow: '0 1px 0 rgba(0,0,0,0.07), 0 2px 6px rgba(0,0,0,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: C.inkMid,
                  }}><Icon /></div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{label}</div>
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 1 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── DIVIDER ──────────────────────────────────────────────── */}
          <div style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 0', flexShrink: 0 }} />

          {/* ── RIGHT — form ─────────────────────────────────────────── */}
          <div className="g-fade-2" style={{ flex: 1, paddingLeft: 64 }}>

            <h2 style={{
              fontSize: 22, fontWeight: 700, color: C.ink,
              letterSpacing: '-0.02em', marginBottom: 8,
            }}>
              Start Investigation
            </h2>
            <p style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.65, marginBottom: 28 }}>
              Enter a UK company number to begin immediate forensic analysis.
            </p>

            {/* Label */}
            <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMid, letterSpacing: '0.07em', marginBottom: 8 }}>
              REGISTRATION NUMBER
            </div>

            {/* Input */}
            <div style={{
              background: C.white,
              border: `1.5px solid ${focused ? C.ink : C.border}`,
              borderRadius: 14,
              boxShadow: focused ? '0 0 0 4px rgba(0,0,0,0.05)' : '0 1px 4px rgba(0,0,0,0.05)',
              transition: 'all 0.18s ease',
              overflow: 'hidden',
            }}>
              <input
                id="crn-input"
                type="text"
                value={crn}
                onChange={e => setCrn(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && go()}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="e.g. 09446231"
                style={{
                  width: '100%', height: 50, border: 'none', outline: 'none',
                  background: 'transparent', padding: '0 18px', boxSizing: 'border-box',
                  fontSize: 15, color: C.ink, fontFamily: FONT,
                  letterSpacing: '0.02em',
                }}
              />
            </div>

            {/* Demo chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.inkMuted }}>Try Demo:</span>
              {DEMOS.map(d => (
                <button
                  key={d.crn}
                  className="demo-chip"
                  onClick={() => setCrn(d.crn)}
                  style={{
                    background: C.white, border: `1.5px solid ${C.borderMd}`,
                    borderRadius: 99, padding: '5px 14px',
                    fontSize: 12, fontWeight: 500, color: C.inkMid,
                    cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >{d.label}</button>
              ))}
            </div>

            {/* CTA */}
            <button
              id="btn-investigate-api"
              className="go-btn"
              disabled={!canGo}
              onClick={() => go()}
              style={{
                width: '100%', height: 50, marginTop: 24,
                background: canGo ? C.ink : '#D6D3CB',
                color: canGo ? '#fff' : C.inkMuted,
                border: 'none', borderRadius: 14,
                fontSize: 14, fontWeight: 600,
                cursor: canGo ? 'pointer' : 'not-allowed',
                fontFamily: FONT, transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: canGo ? '0 4px 20px rgba(0,0,0,0.18)' : 'none',
                letterSpacing: '0.01em',
              }}
            >
              Investigate
              {canGo && <Icons.arrow />}
            </button>

            {/* Footer tags */}
            <div style={{
              display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap',
              justifyContent: 'center',
            }}>
              {['UK Companies House', 'Live OFAC Screening', 'NetworkX Graph Engine'].map(t => (
                <span key={t} style={{
                  fontSize: 11, color: C.inkFaint, fontWeight: 500,
                }}>
                  {t}
                  {t !== 'NetworkX Graph Engine' && <span style={{ marginLeft: 8, color: C.border }}>·</span>}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
