"""
fetch_ch.py — Complete Companies House data fetcher.
Pulls EVERY relevant endpoint and structures the data for maximum KYC signal.
"""
import os
import base64
import requests
from typing import Optional

CH_BASE = "https://api.company-information.service.gov.uk"

OWNERSHIP_BAND_MIDPOINTS = {
    "25-to-50-percent": 37.5,
    "50-to-75-percent": 62.5,
    "75-to-100-percent": 87.5,
    "more-than-25-percent-but-not-more-than-50-percent": 37.5,
    "more-than-50-percent-but-less-than-75-percent": 62.5,
    "75-percent-or-more": 87.5,
}

def _ch_headers() -> dict:
    key = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
    auth = base64.b64encode(f"{key}:".encode()).decode()
    return {"Authorization": f"Basic {auth}"}


def _parse_ownership_pct(natures: list[str]) -> float:
    for n in natures:
        key = n.lower().replace(" ", "-")
        for band, pct in OWNERSHIP_BAND_MIDPOINTS.items():
            if band in key:
                return pct
    return 0.0


def _clean_nature(nature: str) -> str:
    """Convert CH API kebab slug to human-readable text."""
    mapping = {
        "ownership-of-shares-25-to-50-percent":         "25%–50% share ownership",
        "ownership-of-shares-50-to-75-percent":         "50%–75% share ownership",
        "ownership-of-shares-75-to-100-percent":        "75%–100% share ownership",
        "more-than-25-percent-but-not-more-than-50-percent": "25%–50% ownership",
        "more-than-50-percent-but-less-than-75-percent":   "50%–75% ownership",
        "75-percent-or-more":                               "75%+ ownership",
        "voting-rights-25-to-50-percent":               "25%–50% voting rights",
        "voting-rights-50-to-75-percent":               "50%–75% voting rights",
        "voting-rights-75-to-100-percent":              "75%–100% voting rights",
        "right-to-appoint-and-remove-directors":        "Right to appoint/remove directors",
        "significant-influence-or-control":             "Significant influence or control",
    }
    return mapping.get(nature.lower().replace(" ","-"), nature.replace("-", " ").title())


def _safe_get(url: str, headers: dict, params: dict = None) -> Optional[dict]:
    try:
        r = requests.get(url, headers=headers, params=params or {}, timeout=12)
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def fetch_company_full(crn: str) -> dict:
    """
    Fetch ALL relevant Companies House data for a CRN.
    Returns a rich dict used by ch_parser and risk engine.
    """
    crn = crn.strip().upper()
    h = _ch_headers()
    print(f"\n[CH] Fetching full profile for CRN: {crn}")

    # ── Core endpoints ────────────────────────────────────────────────────────
    profile     = _safe_get(f"{CH_BASE}/company/{crn}", h)
    psc_data    = _safe_get(f"{CH_BASE}/company/{crn}/persons-with-significant-control", h)
    officers_r  = _safe_get(f"{CH_BASE}/company/{crn}/officers", h)
    filings_r   = _safe_get(f"{CH_BASE}/company/{crn}/filing-history", h)
    charges_r   = _safe_get(f"{CH_BASE}/company/{crn}/charges", h)
    accounts_r  = _safe_get(f"{CH_BASE}/company/{crn}/accounts", h)

    if not profile:
        raise ValueError(f"Company '{crn}' not found in Companies House.")

    # ── Address ───────────────────────────────────────────────────────────────
    addr = profile.get("registered_office_address", {})
    addr_str = ", ".join(filter(None, [
        addr.get("address_line_1"), addr.get("address_line_2"),
        addr.get("locality"), addr.get("postal_code"), addr.get("country"),
    ]))

    # ── PSCs ──────────────────────────────────────────────────────────────────
    pscs = []
    for item in (psc_data or {}).get("items", []):
        if item.get("ceased_on"):
            continue  # skip ceased PSCs
        natures = item.get("natures_of_control", [])
        pct = _parse_ownership_pct(natures)

        # Jurisdiction — individuals have country_of_residence, corporates have place_registered
        juris = (
            item.get("country_of_residence")
            or item.get("identification", {}).get("place_registered", "")
            or ""
        )

        pscs.append({
            "name": item.get("name", "").strip(),
            "type": item.get("kind", "individual-person-with-significant-control"),
            "ownership_pct": pct,
            "ownership_band": natures[0] if natures else "",
            "natures_of_control": natures,
            "natures_clean": [_clean_nature(n) for n in natures],
            "jurisdiction": juris,
            "is_offshore": False,  # ch_parser will determine this with full logic
            "notified_on": item.get("notified_on"),
        })
    # Sort by ownership % descending so dominant PSC is always first
    pscs.sort(key=lambda p: p["ownership_pct"], reverse=True)

    # ── Officers ──────────────────────────────────────────────────────────────
    all_officers = (officers_r or {}).get("items", [])
    active_officers = []
    resigned_count = 0
    for item in all_officers:
        if item.get("resigned_on"):
            resigned_count += 1
            continue
        active_officers.append({
            "name": item.get("name", "").strip(),
            "role": item.get("officer_role", ""),
            "appointment_date": item.get("appointed_on"),
            "resignation_date": None,
            "is_corporate": item.get("identification", {}).get("identification_type") == "registered-company",
            "nationality": item.get("nationality", ""),
            "country_of_residence": item.get("country_of_residence", ""),
        })

    # ── Filing history analysis ───────────────────────────────────────────────
    filings = (filings_r or {}).get("items", [])
    total_filings = (filings_r or {}).get("total_count", len(filings))

    # Count CS01 (confirmation statements) — more = more diligent
    cs01_count = sum(1 for f in filings if f.get("type", "").startswith("CS"))
    aa_count   = sum(1 for f in filings if f.get("type", "").startswith("AA"))

    # Get 3 most recent filing documents for PDF download
    recent_docs = []
    for f in filings[:10]:  # look through first 10 filings
        ftype = f.get("type", "")
        if ftype in ("CS01", "AA", "SH01", "IN01", "PSC01", "PSC02"):
            doc_url = f.get("links", {}).get("document_metadata")
            if doc_url:
                recent_docs.append({
                    "type": ftype,
                    "date": f.get("date", ""),
                    "description": f.get("description", ""),
                    "doc_url": doc_url,
                })
        if len(recent_docs) >= 3:
            break

    # ── Charges ───────────────────────────────────────────────────────────────
    charges = []
    for ch in (charges_r or {}).get("items", []):
        if ch.get("status") == "outstanding":
            charges.append({
                "description": ch.get("classification", {}).get("description", ""),
                "created_on": ch.get("created_on", ""),
                "secured_against": ch.get("secured_details", {}).get("description", ""),
            })

    # ── Accounts status ───────────────────────────────────────────────────────
    acc = profile.get("accounts", {})
    last_accounts_date = acc.get("last_accounts", {}).get("period_end_on", "")
    accounts_overdue = acc.get("overdue", False)
    accounts_type = acc.get("last_accounts", {}).get("type", "")
    is_dormant = accounts_type in ("dormant", "no-accounts-type-available")

    # ── Company status flags ──────────────────────────────────────────────────
    company_status = profile.get("company_status", "active")
    has_insolvency = bool(profile.get("has_insolvency_history", False))
    has_charges = len(charges) > 0

    print(f"[CH] {profile.get('company_name')} | PSCs: {len(pscs)} | Officers: {len(active_officers)} | Filings: {total_filings} | Dormant: {is_dormant}")

    return {
        # Core identity
        "company_name": profile.get("company_name", ""),
        "crn": crn,
        "company_type": profile.get("type", ""),
        "company_status": company_status,
        "incorporation_date": profile.get("date_of_creation"),
        "sic_codes": profile.get("sic_codes", []),
        "registered_address": addr_str,

        # Ownership
        "pscs": pscs,
        "has_no_psc": (psc_data or {}).get("total_results", 0) == 0,

        # People
        "officers": active_officers,
        "resigned_officer_count": resigned_count,

        # Filings
        "filing_count": total_filings,
        "cs01_count": cs01_count,
        "aa_count": aa_count,
        "recent_docs": recent_docs,

        # Finances
        "charges": charges,
        "has_charges": has_charges,
        "charge_count": len(charges),

        # Accounts
        "last_accounts_date": last_accounts_date,
        "accounts_overdue": accounts_overdue,
        "is_dormant": is_dormant,

        # Red flags
        "has_insolvency": has_insolvency,
        "company_status_flag": company_status not in ("active", ""),

        # PDF docs for Stage 2
        "filing_history_raw": filings,
    }
