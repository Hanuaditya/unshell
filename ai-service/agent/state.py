from typing import Optional, TypedDict


class InvestigationState(TypedDict):
    mode: str
    target_identifier: str
    raw_pdf_bytes: Optional[bytes]

    discovered_nodes: list
    discovered_edges: list
    networkx_graph: Optional[object]

    incorporation_date: Optional[str]
    sic_codes: list
    registered_address: str
    pscs: list
    known_shell_addresses: list
    filing_count: int

    current_risk_score: int
    fatal_flags: list
    cumulative_vectors: list

    status: str
    thread_id: str
    offshore_dead_end: bool
    resolved_ubo: str

    sanctions_hit: bool
    sanctions_detail: str

    final_payload: Optional[dict]
    _raw_data: Optional[dict]
    _active_officers: Optional[list]
    _ubo_type: Optional[str]

    # Extended risk signals — MUST be registered or LangGraph drops them silently
    _is_dormant: Optional[bool]
    _accounts_overdue: Optional[bool]
    _has_insolvency: Optional[bool]
    _company_status: Optional[str]
    _charge_count: Optional[int]
    _resigned_officer_count: Optional[int]

    # RAG filing signals — populated by multi-PDF pipeline
    _filing_risk_signals: Optional[dict]
    _filing_smurf_evidence: Optional[dict]
    _filing_boiler_evidence: Optional[dict]
    _filing_nominee_evidence: Optional[dict]
    _filing_vague_sic_evidence: Optional[dict]
    _filing_hidden_owner_evidence: Optional[dict]
