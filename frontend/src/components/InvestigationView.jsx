import { useState, useRef } from 'react'
import GraphCanvas from './GraphCanvas'
import EvidencePanel from './EvidencePanel'
import RiskScoreboard from './RiskScoreboard'
import EntitySidebar from './EntitySidebar'
import SarDraftModal from './SarDraftModal'
import { generateSar } from '../api/client'

// ─── MOCK DATA (removed) ──────────────────────────────────────────────────────

export default function InvestigationView({ data, crn = '', onReset = () => { }, onUploadDocument = () => { } }) {
  const [selectedEdge, setSelectedEdge] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activeFilters, setActiveFilters] = useState([])

  const [sarModalOpen, setSarModalOpen] = useState(false)
  const [sarDraft, setSarDraft] = useState(null)
  const [sarLoading, setSarLoading] = useState(false)
  const [sarError, setSarError] = useState(null)

  const fileInputRef = useRef(null)

  const graphNodes = data?.graph?.nodes || []
  const graphEdges = data?.graph?.edges || []
  const targetName = graphNodes[0]?.label || data?.resolved_ubo || data?.company_name || 'Investigation'
  const panelWidth = selectedEdge ? 300 : 0

  const handleGenerateSar = async () => {
    setSarModalOpen(true)
    setSarLoading(true)
    setSarError(null)
    try {
      const res = await generateSar(crn)
      setSarDraft(res.sarDraft)
    } catch (err) {
      setSarError(err.message)
    } finally {
      setSarLoading(false)
    }
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: 'var(--cream)', overflow: 'hidden',
    }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: 52,
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center',
        flexShrink: 0, zIndex: 20,
        padding: '0 16px',
        gap: 0,
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
          {/* Icon mark */}
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #2C5282 0%, #6B46C1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
            letterSpacing: '-0.03em', flexShrink: 0,
            boxShadow: '0 2px 8px rgba(107,70,193,0.3)',
          }}>U</div>
          <span style={{
            color: 'var(--text-dark)', fontSize: 13, fontWeight: 800,
            letterSpacing: '0.14em',
          }}>UNSHELL</span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 18, background: 'var(--border-light)', marginRight: 16 }} />

        {/* Target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500 }}>Investigating</span>
          <span style={{
            background: 'var(--cream-2)', border: '1px solid var(--border-light)',
            color: 'var(--text-dark)', fontSize: 11, fontWeight: 600,
            padding: '2px 10px', borderRadius: 9999,
          }}>
            {targetName}
          </span>
          {crn && (
            <span style={{
              background: 'transparent', border: '1px solid var(--border-light)',
              color: 'var(--text-mid)', fontSize: 10, fontWeight: 600,
              padding: '2px 8px', borderRadius: 9999, letterSpacing: '0.08em',
              fontFamily: 'monospace',
            }}>
              #{crn}
            </span>
          )}
        </div>

        {/* Compact scoreboard + UBO in top bar */}
        <RiskScoreboard
          compact
          riskScore={data.risk_score}
          riskLabel={data.risk_label}
          confidence={null} /* hidden for now: data.confidence_score */
          resolvedUbo={data.resolved_ubo}
          sanctionsHit={data.sanctions_hit}
        />

        {/* Divider */}
        <div style={{ width: 1, height: 18, background: 'var(--border-light)', margin: '0 16px' }} />

        {/* CTA */}
        <button
          onClick={onReset}
          style={{
            background: 'var(--white)', border: '1px solid var(--border-light)',
            color: 'var(--text-mid)', fontSize: 12, fontWeight: 600,
            padding: '6px 16px', borderRadius: 9999,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.18s ease', letterSpacing: '0.01em',
            whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--cream-2)'
            e.currentTarget.style.color = 'var(--text-dark)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--white)'
            e.currentTarget.style.color = 'var(--text-mid)'
          }}
        >
          New Investigation
        </button>
      </div>

      {/* ── Dark Floating Dead-End Banner ────────────────────────────────────── */}
      {data.is_dead_end && (
        <div style={{
          position: 'absolute', top: 68, left: '50%', transform: 'translateX(-50%)',
          zIndex: 50,
          background: '#13111C', // Dark navy
          border: '1px solid #D69E2E', // Amber border
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          width: 'max-content',
        }}>
          {/* Warning Icon Box */}
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'rgba(214, 158, 46, 0.15)', border: '1px solid rgba(214, 158, 46, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: '#D69E2E',
          }}>⚠️</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ color: '#F0EEF8', fontSize: 14, fontWeight: 700 }}>
              Offshore Dead-End Detected
            </div>
            <div style={{ color: '#D69E2E', fontSize: 13, fontWeight: 500 }}>
              No UBO found due to pre-2016 registry rules. <span
                onClick={() => fileInputRef.current?.click()}
                style={{
                  color: '#D69E2E', textDecoration: 'underline', cursor: 'pointer',
                  fontWeight: 600, paddingLeft: 4,
                  transition: 'color 0.2s',
                }}
                onMouseOver={e => e.target.style.color = '#F6AD55'}
                onMouseOut={e => e.target.style.color = '#D69E2E'}
              >
                Click Here to Upload Trust Deed
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden File Input ──────────────────────────────────────────────── */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="application/pdf"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadDocument(e.target.files[0])
          }
        }}
      />

      {/* ── 3-column grid ───────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `220px 1fr ${panelWidth}px`,
        transition: 'grid-template-columns 0.28s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        <EntitySidebar
          nodes={graphNodes}
          stats={data?.stats}
          fatalFlags={data?.fatal_flags}
          cumulativeVectors={data?.cumulative_vectors}
          resolvedUbo={data?.resolved_ubo}
          activeFilters={activeFilters}
          onFilterChange={setActiveFilters}
          onEntityClick={id => setSelectedNodeId(id)}
        />

        {graphNodes.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '100%',
            background: 'var(--cream)',
            gap: 12,
          }}>
            <div style={{ fontSize: 32 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dark)' }}>No Graph Data</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 340, textAlign: 'center', lineHeight: 1.6 }}>
              The investigation completed but returned no ownership graph nodes.
              This may be because the company has no PSC or officer data registered.
            </div>
          </div>
        ) : (
          <GraphCanvas
            nodes={graphNodes}
            edges={graphEdges}
            activeFilters={activeFilters}
            focusNodeId={selectedNodeId}
            onEdgeClick={edge => setSelectedEdge(edge)}
            onPaneClick={() => setSelectedEdge(null)}
          />
        )}

        <div style={{ overflow: 'hidden' }}>
          {selectedEdge && (
            <EvidencePanel
              edge={selectedEdge}
              nodes={graphNodes}
              stats={data?.stats}
              onClose={() => setSelectedEdge(null)}
            />
          )}
        </div>
      </div>

      {/* ── Bottom scoreboard ────────────────────────────────────────────────── */}
      <RiskScoreboard
        riskScore={data?.risk_score}
        riskLabel={data?.risk_label}
        fatalFlags={data?.fatal_flags}
        cumulativeVectors={data?.cumulative_vectors}
        confidence={null}
        sanctionsHit={data?.sanctions_hit}
        sanctionsDetail={data?.sanctions_detail}
        resolvedUbo={data?.resolved_ubo}
        onGenerateSar={handleGenerateSar}
      />

      <SarDraftModal 
        open={sarModalOpen}
        onClose={() => setSarModalOpen(false)}
        sarDraft={sarDraft}
        companyName={targetName}
        crn={crn}
        loading={sarLoading}
        error={sarError}
      />
    </div>
  )
}
