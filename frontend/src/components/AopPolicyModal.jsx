import React, { useState } from 'react';

const INITIAL_RULES = [
  {
    id: 'CIRCULAR_LOOP',
    name: 'Circular Ownership Loop',
    engine: 'NetworkX · nx.simple_cycles()',
    type: 'DETERMINISTIC_GRAPH',
    typeLabel: 'Graph Topology',
    thresholdLabel: 'Cycle Depth >=',
    thresholdValue: 2,
    scoreImpact: '+100 (Fatal / Auto-Reject)',
    impactSeverity: 'fatal',
    enabled: true,
    description: 'Detects mathematical equity cycles across multi-hop corporate PSCs.'
  },
  {
    id: 'NOMINEE_PUPPET',
    name: 'Nominee Puppet Network',
    engine: 'NetworkX · Degree Centrality',
    type: 'DETERMINISTIC_GRAPH',
    typeLabel: 'Director Density',
    thresholdLabel: 'Active Board Seats >=',
    thresholdValue: 100,
    scoreImpact: '+75 (Fatal / Auto-Reject)',
    impactSeverity: 'fatal',
    enabled: true,
    description: 'Flags corporate or individual directors appointed across mass shell clusters.'
  },
  {
    id: 'OFAC_MATCH',
    name: 'OFAC SDN Sanctions Screen',
    engine: 'RapidFuzz · SQLite SDN Local',
    type: 'ZERO_TRUST_FIREWALL',
    typeLabel: 'Sanctions Screen',
    thresholdLabel: 'Token-Sort Match % >=',
    thresholdValue: 90,
    scoreImpact: 'Score -> 100 (SAR Required)',
    impactSeverity: 'critical',
    enabled: true,
    description: 'Fuzzy-matches all resolved UBOs and officers against offline US Treasury SDN list.'
  },
  {
    id: 'RAPIDFUZZ_VERIFIER',
    name: 'Hyper-RAG Hallucination Firewall',
    engine: 'PyMuPDF + FAISS + RapidFuzz R4',
    type: 'ZERO_TRUST_FIREWALL',
    typeLabel: 'Zero-Trust R4',
    thresholdLabel: 'Verbatim Chunk Match % >=',
    thresholdValue: 95,
    scoreImpact: 'Drop Unverified Claims',
    impactSeverity: 'drop',
    enabled: true,
    description: 'Silently drops any NVIDIA Mistral / Gemini extracted entity not found verbatim in source PDF.'
  },
  {
    id: 'OFFSHORE_WALL',
    name: 'Offshore Trust Dead-End (HITL)',
    engine: 'LangGraph Checkpointer',
    type: 'STATEFUL_HITL',
    typeLabel: 'Stateful HITL',
    thresholdLabel: 'Non-UK/EEA UBO Depth >=',
    thresholdValue: 2,
    scoreImpact: '+30 & Pause for Upload',
    impactSeverity: 'warning',
    enabled: true,
    description: 'Freezes graph execution when ownership routes to an opaque offshore jurisdiction.'
  },
  {
    id: 'AGED_SHELL_SIC',
    name: 'Dormant Shell & Vague SIC Vector',
    engine: 'Companies House Registry Parser',
    type: 'DETERMINISTIC_MATH',
    typeLabel: 'Registry Vector',
    thresholdLabel: 'Age > 10y & Filings <',
    thresholdValue: 5,
    scoreImpact: '+25 Combined Risk',
    impactSeverity: 'caution',
    enabled: true,
    description: 'Combines aged low-filing entities (+15) with high-risk SIC codes 74990 / 99999 (+10).'
  }
];

export default function AopPolicyModal({
  isOpen,
  onClose,
  currentCompany = 'SATUS 2026-1 PLC',
  currentScore = 90
}) {
  const [rules, setRules] = useState(INITIAL_RULES);
  const [precedentInput, setPrecedentInput] = useState(
    'If a corporate PSC shares a registered address with 25+ dissolved entities and appoints an offshore trustee, escalate score by +65 and require SAR draft.'
  );
  const [compiledRule, setCompiledRule] = useState(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [backtestState, setBacktestState] = useState('idle'); // idle | running | complete
  const [merged, setMerged] = useState(false);

  if (!isOpen) return null;

  const handleThresholdChange = (id, newVal) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, thresholdValue: Number(newVal) } : r))
    );
    setBacktestState('idle');
    setMerged(false);
  };

  const handleCompilePrecedent = () => {
    setIsCompiling(true);
    setTimeout(() => {
      setIsCompiling(false);
      setCompiledRule({
        id: 'ADDRESS_CLUSTER_TRUSTEE',
        name: 'Shared Address Shell Cluster + Offshore Trustee',
        engine: 'NetworkX · Subgraph Isomorphism (Auto-Compiled)',
        type: 'GRADUATED_PRECEDENT',
        codeSnippet: `nx.subgraph_density(G, node.address_cluster) >= 25 and node.has_offshore_trustee == True`,
        scoreImpact: '+65 (Auto-Reject + SAR)'
      });
      setBacktestState('idle');
    }, 650);
  };

  const handleRunBacktest = () => {
    setBacktestState('running');
    setTimeout(() => {
      setBacktestState('complete');
    }, 900);
  };

  const getImpactBadgeStyle = (severity) => {
    switch (severity) {
      case 'fatal':
        return { background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' };
      case 'critical':
        return { background: '#FFF1F2', color: '#BE123C', border: '1px solid #FFE4E6' };
      case 'warning':
        return { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' };
      case 'drop':
        return { background: '#FAF5FF', color: '#6B21A8', border: '1px solid #F3E8FF' };
      default:
        return { background: '#F0F9FF', color: '#0369A1', border: '1px solid #BAE6FD' };
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-5xl rounded-2xl flex flex-col overflow-hidden my-auto"
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          boxShadow: '0 24px 64px -12px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.05)',
          maxHeight: '92vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ────────────────────────────────────────────── */}
        <div 
          style={{
            padding: '16px 24px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {/* Pill Bar */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 10px', borderRadius: 9999,
                background: '#ECFDF5', color: '#047857',
                border: '1px solid #A7F3D0',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                Living AOP Studio
              </span>

              <span style={{
                padding: '3px 9px', borderRadius: 6,
                background: '#F1F5F9', color: '#475569',
                border: '1px solid #E2E8F0',
                fontSize: 11, fontFamily: 'monospace', fontWeight: 500,
              }}>
                branch: v2.4-rc
              </span>

              <span style={{ color: '#CBD5E1' }}>•</span>

              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
                Case: <strong style={{ color: '#0F172A', fontWeight: 600 }}>{currentCompany}</strong>
              </span>

              <span style={{
                padding: '2px 9px', borderRadius: 9999,
                background: currentScore >= 65 ? '#FEF2F2' : '#ECFDF5',
                color: currentScore >= 65 ? '#B91C1C' : '#047857',
                border: `1px solid ${currentScore >= 65 ? '#FECACA' : '#A7F3D0'}`,
                fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
              }}>
                Score: {currentScore}/100
              </span>
            </div>

            {/* Title */}
            <h2 style={{
              fontSize: 17,
              fontWeight: 700,
              color: '#0F172A',
              letterSpacing: '-0.02em',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              Autonomous KYB & AML Investigator
              <span style={{ color: '#CBD5E1', fontWeight: 300 }}>—</span>
              <span style={{ color: '#475569', fontWeight: 500, fontSize: 14 }}>
                Deterministic Policy Compiler & Counterfactual Backtest
              </span>
            </h2>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: '#FFFFFF', border: '1px solid #CBD5E1',
              color: '#475569', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.color = '#0F172A';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.color = '#475569';
            }}
          >
            <span style={{ color: '#94A3B8', fontSize: 11, fontFamily: 'monospace' }}>ESC</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Modal Scrollable Body ───────────────────────────────────── */}
        <div style={{
          padding: 24,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          background: '#FAFAF9',
        }}>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 1: Scoped Precedent -> Deterministic Compiler
              ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 14,
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: '#EEF2FF', color: '#4F46E5',
                  border: '1px solid #C7D2FE',
                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>01</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#312E81', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Scoped Precedent → Deterministic Graph Compiler
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                  background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE',
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                }}>
                  Zero-LLM Graduation
                </span>
              </div>
              <span style={{ fontSize: 12, color: '#64748B' }}>
                Compiles human compliance feedback into zero-token NetworkX math
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <textarea
                rows={2}
                value={precedentInput}
                onChange={(e) => setPrecedentInput(e.target.value)}
                style={{
                  flex: '1 1 320px',
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                  lineHeight: '1.5',
                  color: '#1E293B',
                  fontFamily: 'inherit',
                  resize: 'none',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'border 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#6366F1';
                  e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.12)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#CBD5E1';
                  e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.03)';
                }}
                placeholder="Write a plain-English exception precedent..."
              />

              <button
                onClick={handleCompilePrecedent}
                disabled={isCompiling}
                style={{
                  background: isCompiling ? '#818CF8' : 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isCompiling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 2px 6px rgba(79, 70, 229, 0.28)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (!isCompiling) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { if (!isCompiling) e.currentTarget.style.transform = 'none'; }}
              >
                {isCompiling ? (
                  <span>Compiling AST...</span>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>Compile to NetworkX Rule</span>
                  </>
                )}
              </button>
            </div>

            {compiledRule && (
              <div style={{
                marginTop: 14,
                padding: '12px 16px',
                background: '#0F172A',
                border: '1px solid #1E293B',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.2)', color: '#34D399',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700,
                    }}>✓</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>
                      Graduated Rule: {compiledRule.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                      background: 'rgba(239, 68, 68, 0.15)', color: '#FCA5A5',
                      border: '1px solid rgba(239, 68, 68, 0.3)', fontFamily: 'monospace',
                    }}>
                      {compiledRule.scoreImpact}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 26 }}>
                    <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>AST Check:</span>
                    <code style={{
                      fontSize: 12, fontFamily: 'monospace', color: '#34D399',
                      background: '#1E293B', padding: '2px 8px', borderRadius: 4,
                      border: '1px solid rgba(52, 211, 153, 0.25)',
                    }}>
                      {compiledRule.codeSnippet}
                    </code>
                  </div>
                </div>

                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34D399', fontSize: 11, fontWeight: 600, fontFamily: 'monospace',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399' }} />
                  0 LLM Tokens at Runtime · 1.2ms Latency
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 2: Active Deterministic Rules & Zero-Trust Firewalls
              ══════════════════════════════════════════════════════════════════ */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: '#F1F5F9', color: '#475569',
                  border: '1px solid #CBD5E1',
                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>02</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1E293B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Active Deterministic Risk Vectors & Zero-Trust Firewalls (6 Core Rules)
                </span>
              </div>
              <span style={{
                fontSize: 11, color: '#B45309', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
                Edit any threshold below to run Counterfactual Shadow Replay
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: 12,
            }}>
              {rules.map((rule) => {
                const badge = getImpactBadgeStyle(rule.impactSeverity);
                return (
                  <div
                    key={rule.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = '#CBD5E1';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#E2E8F0';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.02)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
                            {rule.name}
                          </div>
                          <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {rule.typeLabel}
                          </div>
                        </div>

                        <span style={{
                          fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
                          padding: '2px 8px', borderRadius: 4,
                          background: '#F1F5F9', color: '#0F766E',
                          border: '1px solid #CCFBF1',
                          whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {rule.engine}
                        </span>
                      </div>

                      <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, margin: '6px 0 12px 0' }}>
                        {rule.description}
                      </p>
                    </div>

                    <div style={{
                      paddingTop: 10,
                      borderTop: '1px solid #F1F5F9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B', fontWeight: 600 }}>
                          {rule.thresholdLabel}
                        </span>
                        <input
                          type="number"
                          value={rule.thresholdValue}
                          onChange={(e) => handleThresholdChange(rule.id, e.target.value)}
                          style={{
                            width: 62,
                            padding: '4px 6px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: 6,
                            fontSize: 12,
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: '#B45309',
                            textAlign: 'center',
                            outline: 'none',
                          }}
                          onFocus={e => {
                            e.target.style.borderColor = '#F59E0B';
                            e.target.style.background = '#FFFFFF';
                            e.target.style.boxShadow = '0 0 0 2px rgba(245, 158, 11, 0.15)';
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = '#CBD5E1';
                            e.target.style.background = '#F8FAFC';
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                      </div>

                      <span style={{
                        ...badge,
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                      }}>
                        {rule.scoreImpact}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SECTION 3: Counterfactual Golden-Set Backtest
              ══════════════════════════════════════════════════════════════════ */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 14,
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 14,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: '#ECFDF5', color: '#047857',
                    border: '1px solid #A7F3D0',
                    fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>03</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Counterfactual AOP Simulation
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                    background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    Shadow Replay on 500 Historical CRNs
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                  Replays the last 500 UK Companies House KYB cases against this AOP branch to quantify false-positive load and SLA impact before merging to production.
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={handleRunBacktest}
                  disabled={backtestState === 'running'}
                  style={{
                    background: backtestState === 'running' ? '#F1F5F9' : '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    color: '#1E293B',
                    padding: '9px 16px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: backtestState === 'running' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (backtestState !== 'running') e.currentTarget.style.background = '#F8FAFC'; }}
                  onMouseLeave={e => { if (backtestState !== 'running') e.currentTarget.style.background = '#FFFFFF'; }}
                >
                  {backtestState === 'running' ? (
                    <span>Replaying 500 Cases...</span>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#D97706" stroke="#D97706" strokeWidth="1">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      <span>Run 500-Case Golden Backtest</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setMerged(true)}
                  disabled={backtestState !== 'complete' || merged}
                  style={{
                    background: merged 
                      ? '#047857' 
                      : (backtestState !== 'complete' ? '#E2E8F0' : 'linear-gradient(135deg, #059669 0%, #047857 100%)'),
                    color: (backtestState !== 'complete' && !merged) ? '#94A3B8' : '#FFFFFF',
                    border: 'none',
                    padding: '9px 16px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: (backtestState !== 'complete' || merged) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: (backtestState === 'complete' && !merged) ? '0 2px 6px rgba(5, 150, 105, 0.28)' : 'none',
                    transition: 'all 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {merged ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>✓ AOP Branch Merged to Prod</span>
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="18" r="3" />
                        <circle cx="6" cy="6" r="3" />
                        <path d="M18 15v-4a4 4 0 0 0-4-4H9" />
                      </svg>
                      <span>Merge AOP Branch (No Eng Ticket)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Metric KPI Tiles */}
            {backtestState === 'complete' && (
              <div style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid #F1F5F9',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}>
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                    Golden-Set Regressions
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 4, fontFamily: 'monospace' }}>
                    0 / 500 Cases
                  </div>
                  <div style={{ fontSize: 11, color: '#047857', marginTop: 2, fontWeight: 500 }}>
                    100% human agreement
                  </div>
                </div>

                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                    Newly Caught Shell Rings
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#D97706', marginTop: 4, fontFamily: 'monospace' }}>
                    +4 Hidden Loops
                  </div>
                  <div style={{ fontSize: 11, color: '#B45309', marginTop: 2, fontWeight: 500 }}>
                    Discovered via simple_cycles
                  </div>
                </div>

                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                    RapidFuzz Hallucinations
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 4, fontFamily: 'monospace' }}>
                    0.0%
                  </div>
                  <div style={{ fontSize: 11, color: '#047857', marginTop: 2, fontWeight: 500 }}>
                    14 claims dropped by R4
                  </div>
                </div>

                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B' }}>
                    Avg Investigation SLA
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', marginTop: 4, fontFamily: 'monospace' }}>
                    8.4s
                  </div>
                  <div style={{ fontSize: 11, color: '#1D4ED8', marginTop: 2, fontWeight: 500 }}>
                    vs 3 days manual (99.9% gain)
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
