import os
import re
import uuid
import base64
import sqlite3
import requests
import networkx as nx
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from agent.state import InvestigationState
from ai.ch_parser import parse_companies_house_data
from ai.fetch_ch import fetch_company_full
from ai.gemini_extractor import extract_ownership_from_pdf, convert_extraction_to_graph_format
from graph.engine import build_graph, calculate_risk_score

# ── Constants ─────────────────────────────────────────────────────────────────
CH_BASE = "https://api.company-information.service.gov.uk"
CH_DOC_BASE = "https://document-api.company-information.service.gov.uk"
OFFSHORE_JURISDICTIONS = {"gb", "uk", "united kingdom", "england", "wales", "scotland", "northern ireland"}
OWNERSHIP_BAND_MIDPOINTS = {
    "25-to-50-percent": 37.5,
    "50-to-75-percent": 62.5,
    "75-to-100-percent": 87.5,
    "more-than-25-percent-but-not-more-than-50-percent": 37.5,
    "more-than-50-percent-but-less-than-75-percent": 62.5,
    "75-percent-or-more": 87.5,
}

def _ch_headers() -> dict:
    ch_key = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
    auth = base64.b64encode(f"{ch_key}:".encode()).decode()
    return {"Authorization": f"Basic {auth}"}

def _parse_ownership_pct(natures: list[str]) -> float:
    for n in natures:
        key = n.lower().replace(" ", "-")
        for band, pct in OWNERSHIP_BAND_MIDPOINTS.items():
            if band in key:
                return pct
    return 0.0

def _is_offshore(jurisdiction: str) -> bool:
    return jurisdiction.lower().strip() not in OFFSHORE_JURISDICTIONS

# ── Companies House API helpers ───────────────────────────────────────────────
def fetch_uk_api(crn: str) -> dict:
    crn = crn.strip().upper()
    print(f"\n[INVESTIGATE] Fetching Companies House data for CRN: {crn}\n")
    headers = _ch_headers()

    try:
        profile_r = requests.get(f"{CH_BASE}/company/{crn}", headers=headers, timeout=10)
        if profile_r.status_code == 404:
            raise ValueError(f"Company '{crn}' not found in Companies House.")
        elif profile_r.status_code != 200:
            return {"error": f"Companies House returned {profile_r.status_code}", "crn": crn}

        psc_r = requests.get(f"{CH_BASE}/company/{crn}/persons-with-significant-control", headers=headers, timeout=10)
        officers_r = requests.get(f"{CH_BASE}/company/{crn}/officers", headers=headers, timeout=10)
        filings_r = requests.get(f"{CH_BASE}/company/{crn}/filing-history", headers=headers, timeout=10)
    except ValueError:
        raise
    except Exception as exc:
        return {"error": str(exc), "crn": crn}

    profile = profile_r.json()
    psc_data = psc_r.json() if psc_r.status_code == 200 else {}
    officers_data = officers_r.json() if officers_r.status_code == 200 else {}
    filings_data = filings_r.json() if filings_r.status_code == 200 else {}

    addr = profile.get("registered_office_address", {})
    addr_str = ", ".join(filter(None, [
        addr.get("address_line_1"), addr.get("address_line_2"),
        addr.get("locality"), addr.get("postal_code"), addr.get("country"),
    ]))

    officers = []
    for item in officers_data.get("items", []):
        officers.append({
            "name": item.get("name", ""),
            "role": item.get("officer_role", ""),
            "appointment_date": item.get("appointed_on"),
            "resignation_date": item.get("resigned_on"),
            "is_corporate": item.get("identification", {}).get("identification_type") == "registered-company",
        })

    pscs = []
    for item in psc_data.get("items", []):
        juris = item.get("country_of_residence") or item.get("identification", {}).get("place_registered", "")
        natures = item.get("natures_of_control", [])
        pscs.append({
            "name": item.get("name", ""),
            "type": item.get("kind", "individual-person-with-significant-control").replace("-person-with-significant-control", ""),
            "ownership_band": natures[0] if natures else "",
            "ownership_pct": _parse_ownership_pct(natures),
            "jurisdiction": juris,
            "natures_of_control": natures,
            "is_offshore": _is_offshore(juris) if juris else False,
        })

    return {
        "company_name": profile.get("company_name", ""),
        "crn": crn,
        "incorporation_date": profile.get("date_of_creation"),
        "sic_codes": profile.get("sic_codes", []),
        "registered_address": addr_str,
        "filing_history_raw": filings_data.get("items", []),
        "officers": officers,
        "pscs": pscs,
        "filing_count": filings_data.get("total_count", 0),
    }


def download_filing_pdf(crn: str) -> tuple[bytes | None, str]:
    """
    Auto-download the latest CS01 (Confirmation Statement) or
    IN01 (Incorporation) PDF from Companies House filing-history.
    Returns (pdf_bytes, doc_description) or (None, reason).
    """
    headers = _ch_headers()
    crn = crn.strip().upper()

    # Step 1: Get filing history filtered by CS01 then IN01
    pdf_bytes = None
    doc_desc = ""
    for category, doc_type in [("confirmation-statement", "CS01"), ("incorporation", "IN01")]:
        try:
            fh_r = requests.get(
                f"{CH_BASE}/company/{crn}/filing-history",
                headers=headers,
                params={"category": category, "items_per_page": 5},
                timeout=10
            )
            if fh_r.status_code != 200:
                continue
            items = fh_r.json().get("items", [])
            if not items:
                continue

            # Get the most recent filing
            latest = items[0]
            links = latest.get("links", {})
            doc_url = links.get("document_metadata")
            if not doc_url:
                continue

            # Step 2: Get document metadata to find PDF content link
            meta_r = requests.get(doc_url, headers=headers, timeout=10)
            if meta_r.status_code != 200:
                continue
            meta = meta_r.json()

            resources = meta.get("resources", {})
            pdf_link = None
            for res_key, res_val in resources.items():
                if "pdf" in res_val.get("content_type", "").lower():
                    # content URL is the document-api URL
                    pdf_link = meta.get("links", {}).get("self", "").replace(
                        "document-api.company-information.service.gov.uk", 
                        "document-api.company-information.service.gov.uk"
                    )
                    break

            # Step 3: Download the PDF content
            content_url = f"{doc_url}/content"
            dl_r = requests.get(
                content_url,
                headers={**headers, "Accept": "application/pdf"},
                timeout=30
            )
            if dl_r.status_code == 200 and dl_r.content:
                pdf_bytes = dl_r.content
                doc_desc = f"Companies House {doc_type} — {latest.get('date', 'unknown date')}"
                print(f"[FILING] Downloaded {doc_type} PDF ({len(pdf_bytes)} bytes): {doc_desc}")
                return pdf_bytes, doc_desc

        except Exception as e:
            print(f"[FILING] Error downloading {doc_type}: {e}")
            continue

    return None, "No CS01 or IN01 filing found"


# ── Database helpers (no MCP) ─────────────────────────────────────────────────
def query_ofac(name: str) -> dict:
    name = name.strip()
    if not name or name in ("UNKNOWN", "UNKNOWN (OFFSHORE)"):
        return {"match": False, "detail": "No name provided", "program": "", "matched_name": ""}

    db_path = os.path.join(os.path.dirname(__file__), "..", "data", "sanctions.db")
    if not os.path.exists(db_path):
        print(f"[OFAC] WARNING: {db_path} not found. Returning safe.")
        return {"match": False, "detail": "No OFAC match found", "program": "", "matched_name": ""}

    words = name.split()
    try:
        with sqlite3.connect(db_path) as db:
            db.row_factory = sqlite3.Row
            cursor = db.execute("SELECT * FROM sdn_list WHERE UPPER(name) LIKE UPPER(?)", (f"%{name}%",))
            row = cursor.fetchone()
            if row:
                return {"match": True, "detail": f"OFAC SDN match: {dict(row).get('name')}", "program": dict(row).get("program", ""), "matched_name": dict(row).get("name", "")}
            for word in words:
                if len(word) < 4:
                    continue
                cursor = db.execute("SELECT * FROM sdn_list WHERE UPPER(name) LIKE UPPER(?)", (f"%{word}%",))
                row = cursor.fetchone()
                if row:
                    return {"match": True, "detail": f"OFAC SDN partial match on '{word}': {dict(row).get('name')}", "program": dict(row).get("program", ""), "matched_name": dict(row).get("name", "")}
    except Exception as e:
        print(f"[OFAC ERROR] {e}")
    return {"match": False, "detail": "No OFAC match found", "program": "", "matched_name": ""}


def get_known_addresses() -> list[str]:
    db_path = os.path.join(os.path.dirname(__file__), "..", "data", "known_addresses.db")
    if not os.path.exists(db_path):
        return []
    try:
        with sqlite3.connect(db_path) as db:
            cursor = db.execute("SELECT address_text FROM shell_addresses")
            return [r[0] for r in cursor.fetchall()]
    except Exception as e:
        print(f"[ADDRESSES ERROR] {e}")
        return []


# ── LangGraph Nodes ───────────────────────────────────────────────────────────
def input_router_node(state: InvestigationState) -> InvestigationState:
    state["status"] = "in_progress"
    state["thread_id"] = str(uuid.uuid4())
    return state


def fetch_uk_api_node(state: InvestigationState) -> InvestigationState:
    crn = state["target_identifier"]

    # Use comprehensive CH fetcher — pulls all endpoints
    raw_data = fetch_company_full(crn)

    # Stage 1: Pure Python parser — instant, no LLM
    nodes, edges, active_officers = parse_companies_house_data(raw_data)

    state["discovered_nodes"] = nodes
    state["discovered_edges"] = edges
    state["incorporation_date"] = raw_data.get("incorporation_date", "")
    state["sic_codes"] = raw_data.get("sic_codes", [])
    state["registered_address"] = raw_data.get("registered_address", "")
    state["filing_count"] = raw_data.get("filing_count", 0)
    state["pscs"] = raw_data.get("pscs", [])
    state["_raw_data"] = raw_data
    state["_active_officers"] = active_officers

    # Extended risk signals
    state["_is_dormant"] = raw_data.get("is_dormant", False)
    state["_accounts_overdue"] = raw_data.get("accounts_overdue", False)
    state["_has_insolvency"] = raw_data.get("has_insolvency", False)
    state["_company_status"] = raw_data.get("company_status", "active")
    state["_charge_count"] = raw_data.get("charge_count", 0)
    state["_resigned_officer_count"] = raw_data.get("resigned_officer_count", 0)

    offshore_count = sum(1 for psc in state["pscs"] if psc.get("is_offshore", False))
    state["offshore_dead_end"] = offshore_count > 0

    # ── UBO Extraction ────────────────────────────────────────────────────────
    # PSCs are already sorted by ownership_pct descending from fetch_company_full
    pscs = state["pscs"]

    if not pscs:
        state["resolved_ubo"] = "Unresolved — No PSC Registered (EDD Required)"
        state["_ubo_type"] = "unknown"
    elif state["offshore_dead_end"]:
        # Dominant offshore PSC
        top_offshore = next((p for p in pscs if p.get("is_offshore", False)), pscs[0])
        state["resolved_ubo"] = f"Unresolved — Offshore Entity: {top_offshore['name']}"
        state["_ubo_type"] = "offshore"
    else:
        # Find the individual with the HIGHEST ownership percentage
        individual_pscs = [
            p for p in pscs
            if "individual" in p.get("type", "").lower()
            and not p.get("is_offshore", False)
        ]
        if individual_pscs:
            # Already sorted descending — take first = highest ownership
            top_individual = individual_pscs[0]
            state["resolved_ubo"] = top_individual["name"]
            state["_ubo_type"] = "individual"
        else:
            # Corporate PSC chain — unresolved, needs EDD
            top_corporate = pscs[0]  # highest % corporate PSC
            state["resolved_ubo"] = f"Unresolved — Corporate Chain (EDD Required)"
            state["_ubo_type"] = "corporate_chain"

    return state


def _expand_corporate_psc_depth(state: InvestigationState) -> InvestigationState:
    """
    Level 2 Depth Expansion: For every Corporate PSC found at Level 1,
    fetch its own Companies House PSCs/officers and add them as Level 2 nodes.
    """
    existing_labels = {n["label"].lower() for n in state["discovered_nodes"]}
    existing_edge_ids = {e["id"] for e in state["discovered_edges"]}
    new_depth_nodes = 0

    corporate_pscs = [
        n for n in state["discovered_nodes"]
        if n.get("type") == "company" and not n.get("is_target", False)
    ]

    for corp_node in corporate_pscs:
        corp_label = corp_node["label"]
        corp_id = corp_node["id"]

        try:
            headers = _ch_headers()
            search_r = requests.get(
                f"{CH_BASE}/search/companies",
                headers=headers,
                params={"q": corp_label, "items_per_page": 1},
                timeout=8
            )
            if search_r.status_code != 200:
                continue
            items = search_r.json().get("items", [])
            if not items:
                continue
            child_crn = items[0].get("company_number", "")
            child_name = items[0].get("title", corp_label)
            child_status = items[0].get("company_status", "")
            if not child_crn or child_status not in ("active", ""):
                continue
            print(f"[DEPTH-2] >> Expanding: {child_name} ({child_crn})")
            child_raw = fetch_company_full(child_crn)
            child_nodes, _, _ = parse_companies_house_data(child_raw)
            for node in child_nodes:
                if node.get("is_target"):
                    continue
                if node["label"].lower() not in existing_labels:
                    node["depth"] = 2
                    node["tags"] = node.get("tags", []) + ["DEPTH_2"]
                    state["discovered_nodes"].append(node)
                    existing_labels.add(node["label"].lower())
                    new_depth_nodes += 1
                    edge_id = f"d2_{node['id']}_to_{corp_id}"
                    if edge_id not in existing_edge_ids:
                        state["discovered_edges"].append({
                            "id": edge_id,
                            "source": node["id"],
                            "target": corp_id,
                            "label": "controls (chain)",
                            "ownership_pct": node.get("ownership_pct"),
                            "trust_score": 1.0,
                            "evidence_snippet": f"Depth-2: {node['label']} controls {child_name}",
                            "source_doc": "Companies House API (Depth-2)",
                            "source_page": None,
                        })
                        existing_edge_ids.add(edge_id)
        except Exception as e:
            print(f"[DEPTH-2] WARN Failed: {corp_label}: {e}")
            continue

    if new_depth_nodes > 0:
        print(f"[DEPTH-2] OK Added {new_depth_nodes} Level-2 nodes")
    return state


def _download_filings_multi(crn: str, categories: list) -> list[tuple[bytes, str]]:
    """
    Download up to 1 PDF per category (CS01, SH01, AA).
    Returns list of (pdf_bytes, doc_description) tuples.
    """
    headers = _ch_headers()
    crn = crn.strip().upper()
    results = []

    for category, doc_type in categories:
        try:
            fh_r = requests.get(
                f"{CH_BASE}/company/{crn}/filing-history",
                headers=headers,
                params={"category": category, "items_per_page": 3},
                timeout=10
            )
            if fh_r.status_code != 200:
                continue
            items = fh_r.json().get("items", [])
            if not items:
                continue

            latest = items[0]
            links = latest.get("links", {})
            doc_url = links.get("document_metadata")
            if not doc_url:
                continue

            content_url = f"{doc_url}/content"
            dl_r = requests.get(
                content_url,
                headers={**headers, "Accept": "application/pdf"},
                timeout=30
            )
            if dl_r.status_code == 200 and dl_r.content:
                doc_desc = f"Companies House {doc_type} — {latest.get('date', 'unknown date')}"
                print(f"[FILING] OK Downloaded {doc_type} ({len(dl_r.content)} bytes)")
                results.append((dl_r.content, doc_desc))
        except Exception as e:
            print(f"[FILING] WARN Error downloading {doc_type}: {e}")
            continue

    return results


def _run_targeted_risk_queries(faiss_index, chunks: list) -> dict:
    """
    Run 5 targeted semantic queries against the FAISS index.
    Only fires a signal if the BEST matching chunk has L2 distance < threshold
    (lower = more similar in FAISS). This prevents false-positive signals
    on unrelated content — FAISS always returns results, so we MUST threshold.
    """
    queries = {
        "SMURF_NETWORK":  ("shareholder percentage ownership allotted shares 15 20 24 percent capital equity", 0.65),
        "BOILER_ROOM":    ("registered office address suite floor flat virtual serviced mailbox", 0.70),
        "VAGUE_SIC":      ("nature of business activity dormant holding management consultancy 74990 99999", 0.60),
        "NOMINEE_LAYER":  ("nominee director secretary appointed on behalf nominee agreement", 0.55),
        "HIDDEN_OWNER":   ("beneficial owner ultimate beneficial trust foundation discretionary Cayman BVI offshore", 0.60),
    }

    signals_found = {}

    if not faiss_index:
        return signals_found

    for signal_key, (query_text, threshold) in queries.items():
        try:
            docs_and_scores = faiss_index.similarity_search_with_score(query_text, k=3)
            if not docs_and_scores:
                continue

            # Sort by score ascending (lower L2 = closer match)
            docs_and_scores.sort(key=lambda x: x[1])
            best_doc, best_score = docs_and_scores[0]

            # Only fire if score is below threshold (confident semantic match)
            if best_score < threshold:
                snippet = best_doc.page_content[:300]
                page = best_doc.metadata.get("page", "?")
                signals_found[signal_key] = {
                    "evidence": snippet,
                    "page": page,
                    "chunk_id": best_doc.metadata.get("chunk_id", ""),
                    "score": round(float(best_score), 4),
                }
                print(f"[FILING-RAG] TARGET Signal [{signal_key}] CONFIRMED (score={best_score:.3f} < {threshold}) on page {page}")
            else:
                print(f"[FILING-RAG] ⬜ Signal [{signal_key}] NOT confident (score={best_score:.3f} >= {threshold})")
        except Exception as e:
            print(f"[FILING-RAG] Query error for {signal_key}: {e}")

    return signals_found


def fetch_filing_pdf_node(state: InvestigationState) -> InvestigationState:
    """
    Stage 2 (ENHANCED): Auto-download up to 3 filing PDFs (CS01, SH01, AA),
    run the full 4-stage RAG pipeline on each, then run targeted
    risk-vector queries against the merged FAISS index to detect
    Smurf Networks, Boiler Rooms, Vague SIC, Nominee Layers & Hidden Owners.
    """
    from rag_engine import pdf_ingest, embed_and_index, nvidia_mistral_extract, cross_verify_firewall

    crn = state["target_identifier"]
    print(f"\n[FILING] >> Auto-downloading multi-PDF filings for CRN: {crn}")

    # Download up to 3 distinct filing types
    filings = _download_filings_multi(crn, [
        ("confirmation-statement", "CS01"),   # Shareholders + officers
        ("capital-allotment",      "SH01"),   # Share allotments (correct CH category)
        ("accounts",               "AA"),     # Annual accounts (dormancy/insolvency signals)
    ])

    if not filings:
        print("[FILING] No PDFs available. Continuing with API data only.")
        return state

    # ── Merge all PDFs into one combined FAISS index ──────────────────────────
    combined_chunks: list[dict] = []
    merged_faiss = None
    all_rag_results = []

    for pdf_bytes, doc_desc in filings:
        try:
            print(f"\n[FILING-RAG] [DOC] Processing: {doc_desc}")

            # Stage R1: Ingest
            ingest_result = pdf_ingest(pdf_bytes)
            raw_blocks = ingest_result["raw_blocks"]

            if not raw_blocks:
                print(f"[FILING-RAG] WARN Empty document: {doc_desc}")
                continue

            # Stage R2: Chunk + Embed
            index_result = embed_and_index(raw_blocks)
            faiss_index = index_result["faiss_index"]
            chunks = index_result["chunks"]

            if chunks:
                combined_chunks.extend(chunks)
                # Merge FAISS indexes — add all documents into first index
                if merged_faiss is None:
                    merged_faiss = faiss_index
                else:
                    # Merge by adding the texts from the new index into the existing one
                    texts = [c["text"] for c in chunks]
                    metas = [{"chunk_id": c["chunk_id"], "page": c["page"]} for c in chunks]
                    merged_faiss.add_texts(texts, metadatas=metas)

                # Stage R3 + R4: Extract & Verify
                extract_result = nvidia_mistral_extract(faiss_index, chunks)
                verify_result = cross_verify_firewall(extract_result["raw_extraction"], chunks)
                verify_result["_doc_desc"] = doc_desc
                all_rag_results.append(verify_result)

                print(f"[FILING-RAG] OK {doc_desc}: {len(verify_result['discovered_nodes'])} nodes, {len(verify_result['discovered_edges'])} edges verified")

        except Exception as e:
            print(f"[FILING-RAG] ERR Pipeline failed for {doc_desc}: {e}")
            continue

    # ── Merge verified nodes + edges into investigation state ────────────────
    existing_labels = {n["label"].lower() for n in state["discovered_nodes"]}
    existing_edge_ids = {e["id"] for e in state["discovered_edges"]}
    total_new_nodes = 0
    total_new_edges = 0

    for rag_result in all_rag_results:
        doc_desc = rag_result.get("_doc_desc", "Filing PDF")

        for node in rag_result.get("discovered_nodes", []):
            if node["label"].lower() not in existing_labels:
                node["tags"] = node.get("tags", []) + ["PDF_VERIFIED"]
                state["discovered_nodes"].append(node)
                existing_labels.add(node["label"].lower())
                total_new_nodes += 1

        for edge in rag_result.get("discovered_edges", []):
            edge_id = f"pdf_{edge['id']}"
            if edge_id not in existing_edge_ids:
                edge["id"] = edge_id
                edge["source_doc"] = doc_desc
                state["discovered_edges"].append(edge)
                existing_edge_ids.add(edge_id)
                total_new_edges += 1

        # Override UBO if PDF found a more accurate individual
        for node in rag_result.get("discovered_nodes", []):
            if node.get("type") == "individual" and node.get("trust_score", 0) >= 0.9:
                print(f"[FILING-RAG] TARGET PDF-verified UBO override: {node['label']}")
                state["resolved_ubo"] = f"{node['label']} (PDF Verified)"
                break

    print(f"\n[FILING] Merged {total_new_nodes} new nodes + {total_new_edges} new edges from {len(filings)} PDFs")

    # ── Run targeted risk-vector queries against merged FAISS index ───────────
    if merged_faiss and combined_chunks:
        print("\n[FILING-RAG] >> Running targeted risk-vector queries...")
        filing_signals = _run_targeted_risk_queries(merged_faiss, combined_chunks)
        state["_filing_risk_signals"] = filing_signals

        # Promote signals to state for engine to consume
        if "SMURF_NETWORK" in filing_signals:
            state["_filing_smurf_evidence"] = filing_signals["SMURF_NETWORK"]
        if "BOILER_ROOM" in filing_signals:
            state["_filing_boiler_evidence"] = filing_signals["BOILER_ROOM"]
        if "NOMINEE_LAYER" in filing_signals:
            state["_filing_nominee_evidence"] = filing_signals["NOMINEE_LAYER"]
        if "VAGUE_SIC" in filing_signals:
            state["_filing_vague_sic_evidence"] = filing_signals["VAGUE_SIC"]
        if "HIDDEN_OWNER" in filing_signals:
            state["_filing_hidden_owner_evidence"] = filing_signals["HIDDEN_OWNER"]
            state["offshore_dead_end"] = True  # RAG confirmed hidden offshore layer

        print(f"[FILING-RAG] OK Signals detected: {list(filing_signals.keys())}")

    return state


def calculate_risk_node(state: InvestigationState) -> InvestigationState:
    known_shells = get_known_addresses()
    state["known_shell_addresses"] = known_shells

    graph = build_graph(state["discovered_nodes"], state["discovered_edges"])
    state["networkx_graph"] = None

    score, fatal_flags, cumulative_vectors = calculate_risk_score(
        nodes=state["discovered_nodes"],
        edges=state["discovered_edges"],
        graph=graph,
        incorporation_date=state["incorporation_date"],
        sic_codes=state["sic_codes"],
        address=state["registered_address"],
        pscs=state["pscs"],
        known_shell_addresses=known_shells,
        filing_count=state["filing_count"],
        is_dormant=state.get("_is_dormant", False),
        accounts_overdue=state.get("_accounts_overdue", False),
        has_insolvency=state.get("_has_insolvency", False),
        company_status=state.get("_company_status", "active"),
        charge_count=state.get("_charge_count", 0),
        resigned_officer_count=state.get("_resigned_officer_count", 0),
        filing_risk_signals=state.get("_filing_risk_signals", {}),
    )
    risk_result = {"score": score, "fatal_flags": fatal_flags, "cumulative_vectors": cumulative_vectors, "loop_nodes": [], "puppet_nodes": []}

    state["current_risk_score"] = risk_result["score"]
    state["fatal_flags"] = risk_result["fatal_flags"]
    state["cumulative_vectors"] = risk_result["cumulative_vectors"]

    for node in state["discovered_nodes"]:
        if "tags" not in node:
            node["tags"] = []
        if node["id"] in risk_result.get("loop_nodes", []):
            if "LOOP" not in node["tags"]: node["tags"].append("LOOP")
        if node["id"] in risk_result.get("puppet_nodes", []):
            if "PUPPET" not in node["tags"]: node["tags"].append("PUPPET")
        jurisdiction = node.get("jurisdiction", "")
        if jurisdiction and jurisdiction.lower() not in ["england", "wales", "scotland", "northern ireland", "united kingdom"]:
            if "OFFSHORE" not in node["tags"]: node["tags"].append("OFFSHORE")

    return state


def sanctions_check_node(state: InvestigationState) -> InvestigationState:
    ubo_name = state["resolved_ubo"]
    ofac_result = query_ofac(ubo_name)

    if ofac_result["match"]:
        state["sanctions_hit"] = True
        state["sanctions_detail"] = f"{ofac_result['matched_name']} - {ofac_result['program']}"
        state["current_risk_score"] = 100
        if "OFAC_MATCH" not in state["fatal_flags"]:
            state["fatal_flags"].append("OFAC_MATCH")
        for node in state["discovered_nodes"]:
            if node.get("label", "").lower() in (ubo_name.lower(), ofac_result["matched_name"].lower()):
                if "tags" not in node: node["tags"] = []
                if "OFAC" not in node["tags"]: node["tags"].append("OFAC")
    else:
        state["sanctions_hit"] = False
        state["sanctions_detail"] = ""

    return state


def compile_output_node(state: InvestigationState) -> InvestigationState:
    score = state["current_risk_score"]

    if score >= 95 or state["sanctions_hit"]:
        status = "auto_reject"
        action_required = "SAR Filing Required" if state["sanctions_hit"] else "Immediate Rejection"
    else:
        status = "complete"
        action_required = "Human Review" if score >= 30 else "Auto-Approve"

    if score <= 64:
        risk_label = "HUMAN_REVIEW"
    elif score <= 94:
        risk_label = "AUTO_REJECT"
    else:
        risk_label = "CRITICAL_SAR"


    graph = build_graph(state["discovered_nodes"], state["discovered_edges"])
    jurisdictions = set(node.get("jurisdiction", "Unknown") for node in state["discovered_nodes"])

    try:
        cycles_len = len(list(nx.simple_cycles(graph))) if graph else 0
    except:
        cycles_len = 0

    # ── Final safety prune: remove any orphan nodes before sending to frontend ──
    # (catches any nodes added by RAG/PDF after the cleanup_graph step)
    edges = state["discovered_edges"]
    connected_ids = set()
    for e in edges:
        connected_ids.add(e["source"])
        connected_ids.add(e["target"])
    clean_nodes = [n for n in state["discovered_nodes"] if n["id"] in connected_ids]
    orphans_removed = len(state["discovered_nodes"]) - len(clean_nodes)
    if orphans_removed > 0:
        print(f"[COMPILE] [CLEAN] Final prune removed {orphans_removed} orphan nodes")

    # Let the frontend Dagre layout handle positioning
    positioned_nodes = clean_nodes

    pdf_verified = any("PDF_VERIFIED" in n.get("tags", []) for n in state["discovered_nodes"])
    ubo_type = state.get("_ubo_type", "unknown")
    active_officers = state.get("_active_officers", [])

    # Calculate Confidence Score (0-100%)
    conf_score = 100
    if not pdf_verified: conf_score -= 15
    if ubo_type == "corporate_chain": conf_score -= 25
    if ubo_type == "unknown": conf_score -= 40
    if state.get("offshore_dead_end"): conf_score -= 20
    
    is_dead_end = (ubo_type == "unknown" or state.get("offshore_dead_end", False))

    final_payload = {
        "status": status,
        "thread_id": state["thread_id"],
        "risk_score": score,
        "risk_label": risk_label,
        "confidence_score": conf_score,
        "fatal_flags": state["fatal_flags"],
        "cumulative_vectors": state["cumulative_vectors"],
        "action_required": action_required,
        "resolved_ubo": state["resolved_ubo"],
        "ubo_type": ubo_type,
        "sanctions_hit": state["sanctions_hit"],
        "sanctions_detail": state["sanctions_detail"],
        "pdf_verified": pdf_verified,
        "is_dead_end": is_dead_end,
        "officers": active_officers,
        "graph": {
            "nodes": positioned_nodes,
            "edges": state["discovered_edges"]
        },
        "stats": {
            "total_entities": len(state["discovered_nodes"]),
            "loops_detected": cycles_len,
            "puppets_detected": sum(1 for f in state["fatal_flags"] if f == "NOMINEE_PUPPET"),
            "jurisdictions": list(jurisdictions),
            "investigation_depth": max(
                2 if any("DEPTH_2" in n.get("tags", []) for n in state["discovered_nodes"]) else 1,
                2 if pdf_verified else 1,
            )
        }
    }

    state["final_payload"] = final_payload
    state["status"] = status
    return state


# ── Graph assembly ─────────────────────────────────────────────────────────────
def cleanup_graph_node(state: InvestigationState) -> InvestigationState:
    """
    Pre-risk cleanup:
    1. Remove floating nodes (no edges connecting them) — avoids ghost nodes
    2. Tag the resolved UBO node with 'UBO' badge for frontend highlighting
    """
    nodes = state["discovered_nodes"]
    edges = state["discovered_edges"]

    # Build set of node IDs that appear in at least one edge
    connected_ids = set()
    for e in edges:
        connected_ids.add(e["source"])
        connected_ids.add(e["target"])

    # Remove nodes with zero connections (floating ghosts)
    before_count = len(nodes)
    nodes = [n for n in nodes if n["id"] in connected_ids]
    removed = before_count - len(nodes)
    if removed > 0:
        print(f"[CLEANUP] [CLEAN] Removed {removed} floating/orphan nodes")

    # Tag the UBO node so the frontend can highlight it
    resolved_ubo = state.get("resolved_ubo", "")
    ubo_name_clean = resolved_ubo.replace(" (PDF Verified)", "").lower().strip()
    if ubo_name_clean:
        for node in nodes:
            node_label_clean = node.get("label", "").lower().strip()
            # Match on word overlap (handles inverted CH names)
            ubo_parts = set(ubo_name_clean.split())
            node_parts = set(node_label_clean.replace(",", " ").split())
            if len(ubo_parts & node_parts) >= 2 or ubo_name_clean == node_label_clean:
                if "tags" not in node:
                    node["tags"] = []
                if "UBO" not in node["tags"]:
                    node["tags"].append("UBO")
                    print(f"[CLEANUP] [TAG] Tagged UBO node: {node['label']}")
                break

    state["discovered_nodes"] = nodes
    return state


def build_investigation_graph() -> StateGraph:
    workflow = StateGraph(InvestigationState)

    workflow.add_node("input_router",    input_router_node)
    workflow.add_node("fetch_uk_api",    fetch_uk_api_node)
    workflow.add_node("depth_expand",    _expand_corporate_psc_depth)
    workflow.add_node("cleanup_graph",   cleanup_graph_node)
    # fetch_filing_pdf_node skipped — rag_engine not available in this env
    workflow.add_node("calculate_risk",  calculate_risk_node)
    workflow.add_node("sanctions_check", sanctions_check_node)
    workflow.add_node("compile_output",  compile_output_node)

    workflow.set_entry_point("input_router")
    workflow.add_edge("input_router",    "fetch_uk_api")
    workflow.add_edge("fetch_uk_api",    "depth_expand")    # Level 2 expansion
    workflow.add_edge("depth_expand",    "cleanup_graph")   # cleanup: remove floaters + tag UBO
    workflow.add_edge("cleanup_graph",   "calculate_risk")  # skip RAG PDF step
    workflow.add_edge("calculate_risk",  "sanctions_check")
    workflow.add_edge("sanctions_check", "compile_output")
    workflow.add_edge("compile_output",  END)

    checkpointer = MemorySaver()
    app = workflow.compile(checkpointer=checkpointer)
    return app


def run_investigation(crn: str) -> dict:
    app = build_investigation_graph()
    initial_state = {
        "mode": "api",
        "target_identifier": crn,
        "discovered_nodes": [],
        "discovered_edges": [],
        "networkx_graph": None,
        "incorporation_date": "",
        "sic_codes": [],
        "registered_address": "",
        "filing_count": 0,
        "pscs": [],
        "offshore_dead_end": False,
        "resolved_ubo": "",
        "known_shell_addresses": [],
        "current_risk_score": 0,
        "fatal_flags": [],
        "cumulative_vectors": [],
        "sanctions_hit": False,
        "sanctions_detail": "",
        "status": "in_progress",
        "thread_id": "",
        "final_payload": {},
        "_raw_data": {},
        "_active_officers": [],
        "_ubo_type": "unknown",
        "_is_dormant": False,
        "_accounts_overdue": False,
        "_has_insolvency": False,
        "_company_status": "active",
        "_charge_count": 0,
        "_resigned_officer_count": 0,
        # RAG filing signals — populated by multi-PDF pipeline
        "_filing_risk_signals": {},
        "_filing_smurf_evidence": None,
        "_filing_boiler_evidence": None,
        "_filing_nominee_evidence": None,
        "_filing_vague_sic_evidence": None,
        "_filing_hidden_owner_evidence": None,
    }
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    result = app.invoke(initial_state, config)
    return result["final_payload"]


def run_investigation_document(pdf_bytes: bytes, filename: str = "document.pdf") -> dict:
    """Document upload path — Gemini reads your own PDF."""
    print(f"\n[DOCUMENT] Extracting ownership from: {filename}\n")

    extraction = extract_ownership_from_pdf(pdf_bytes)
    nodes, edges = convert_extraction_to_graph_format(extraction, document_name=filename)

    known_shells = get_known_addresses()
    graph = build_graph(nodes, edges)
    score, fatal_flags_raw, cumulative_vectors_raw = calculate_risk_score(
        nodes=nodes,
        edges=edges,
        graph=graph,
        incorporation_date="",
        sic_codes=[],
        address="",
        pscs=[],
        known_shell_addresses=known_shells,
        filing_count=0
    )
    risk_result = {"score": score, "fatal_flags": fatal_flags_raw, "cumulative_vectors": cumulative_vectors_raw}

    resolved_ubo = "UNKNOWN"
    for entity in extraction.entities:
        if entity.type == "individual":
            resolved_ubo = entity.name
            break

    fatal_flags = list(risk_result["fatal_flags"])
    sanctions_hit = False
    sanctions_detail = ""
    if resolved_ubo != "UNKNOWN":
        ofac = query_ofac(resolved_ubo)
        if ofac.get("match"):
            sanctions_hit = True
            sanctions_detail = f"{ofac['matched_name']} - {ofac['program']}"
            fatal_flags.append("OFAC_MATCH")

    score = 100 if sanctions_hit else risk_result["score"]
    if score <= 29:    risk_label = "LOW_RISK"
    elif score <= 64:  risk_label = "MEDIUM_RISK"
    elif score <= 94:  risk_label = "HIGH_RISK"
    else:              risk_label = "CRITICAL"

    status = "auto_reject" if (score >= 95 or sanctions_hit) else "complete"
    action = "SAR Filing Required" if sanctions_hit else ("Human Review" if score >= 30 else "Auto-Approve")
    jurisdictions = list(set(n.get("jurisdiction", "Unknown") for n in nodes))

    try:
        cycles_len = len(list(nx.simple_cycles(graph))) if graph else 0
    except:
        cycles_len = 0

    return {
        "status": status,
        "thread_id": str(uuid.uuid4()),
        "risk_score": score,
        "risk_label": risk_label,
        "fatal_flags": fatal_flags,
        "cumulative_vectors": risk_result.get("cumulative_vectors", []),
        "action_required": action,
        "resolved_ubo": resolved_ubo,
        "sanctions_hit": sanctions_hit,
        "sanctions_detail": sanctions_detail,
        "pdf_verified": True,
        "document_type": extraction.document_type,
        "extraction_confidence": extraction.extraction_confidence,
        "warnings": extraction.warnings,
        "graph": {"nodes": nodes, "edges": edges},
        "stats": {
            "total_entities": len(nodes),
            "loops_detected": cycles_len,
            "puppets_detected": sum(1 for f in fatal_flags if f == "NOMINEE_PUPPET"),
            "jurisdictions": jurisdictions,
            "investigation_depth": 2
        }
    }
