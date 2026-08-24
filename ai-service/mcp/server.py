import os
import json
import logging
import aiosqlite
import httpx
from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("fusion.mcp")

CH_BASE = "https://api.company-information.service.gov.uk"
CH_KEY = os.environ.get("COMPANIES_HOUSE_API_KEY", "")
DB_SANCTIONS = os.path.join(os.path.dirname(__file__), "..", "data", "sanctions.db")
DB_ADDRESSES = os.path.join(os.path.dirname(__file__), "..", "data", "known_addresses.db")

OFFSHORE_JURISDICTIONS = {"gb", "uk", "united kingdom", "england", "wales", "scotland", "northern ireland"}

OWNERSHIP_BAND_MIDPOINTS = {
    "25-to-50-percent": 37.5,
    "50-to-75-percent": 62.5,
    "75-to-100-percent": 87.5,
    "more-than-25-percent-but-not-more-than-50-percent": 37.5,
    "more-than-50-percent-but-less-than-75-percent": 62.5,
    "75-percent-or-more": 87.5,
}

app = FastAPI(title="Fusion MCP Server", version="2.0")


def _parse_ownership_pct(natures: list[str]) -> float:
    for n in natures:
        key = n.lower().replace(" ", "-")
        for band, pct in OWNERSHIP_BAND_MIDPOINTS.items():
            if band in key:
                return pct
    return 0.0


def _is_offshore(jurisdiction: str) -> bool:
    return jurisdiction.lower().strip() not in OFFSHORE_JURISDICTIONS


@app.post("/tools/fetch_uk_api")
async def fetch_uk_api(payload: dict) -> dict:
    crn = payload.get("crn", "").strip().upper()
    auth = (CH_KEY, "")

    async with httpx.AsyncClient(auth=auth, timeout=15.0) as client:
        try:
            profile_r = await client.get(f"{CH_BASE}/company/{crn}")
            psc_r = await client.get(f"{CH_BASE}/company/{crn}/persons-with-significant-control")
            officers_r = await client.get(f"{CH_BASE}/company/{crn}/officers")
            filings_r = await client.get(f"{CH_BASE}/company/{crn}/filing-history")
        except httpx.RequestError as exc:
            return {"error": str(exc), "crn": crn}

    if profile_r.status_code != 200:
        return {"error": f"Companies House returned {profile_r.status_code}", "crn": crn}

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
            "type": item.get("kind", "individual-person-with-significant-control").replace("-person-with-significant-control", "").replace("individual", "individual"),
            "ownership_band": natures[0] if natures else "",
            "ownership_pct": _parse_ownership_pct(natures),
            "jurisdiction": juris,
            "natures_of_control": natures,
            "is_offshore": _is_offshore(juris),
        })

    return {
        "company_name": profile.get("company_name", ""),
        "crn": crn,
        "incorporation_date": profile.get("date_of_creation"),
        "sic_codes": profile.get("sic_codes", []),
        "registered_address": addr_str,
        "raw_address_string": addr_str,
        "officers": officers,
        "pscs": pscs,
        "filing_count": filings_data.get("total_count", 0),
    }


@app.post("/tools/query_ofac")
async def query_ofac(payload: dict) -> dict:
    name = payload.get("name", "").strip()
    if not name:
        return {"match": False, "detail": "No name provided", "program": "", "matched_name": ""}

    words = name.split()

    async with aiosqlite.connect(DB_SANCTIONS) as db:
        db.row_factory = aiosqlite.Row

        cursor = await db.execute(
            "SELECT * FROM sdn_list WHERE UPPER(name) LIKE UPPER(?)",
            (f"%{name}%",),
        )
        row = await cursor.fetchone()
        if row:
            return {
                "match": True,
                "detail": f"OFAC SDN match: {dict(row).get('name')}",
                "program": dict(row).get("program", ""),
                "matched_name": dict(row).get("name", ""),
            }

        for word in words:
            if len(word) < 4:
                continue
            cursor = await db.execute(
                "SELECT * FROM sdn_list WHERE UPPER(name) LIKE UPPER(?)",
                (f"%{word}%",),
            )
            row = await cursor.fetchone()
            if row:
                return {
                    "match": True,
                    "detail": f"OFAC SDN partial match on '{word}': {dict(row).get('name')}",
                    "program": dict(row).get("program", ""),
                    "matched_name": dict(row).get("name", ""),
                }

    return {"match": False, "detail": "No OFAC match found", "program": "", "matched_name": ""}


@app.get("/tools/known_addresses")
async def get_known_addresses() -> list[str]:
    async with aiosqlite.connect(DB_ADDRESSES) as db:
        cursor = await db.execute("SELECT address_text FROM shell_addresses")
        rows = await cursor.fetchall()
        return [r[0] for r in rows]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
