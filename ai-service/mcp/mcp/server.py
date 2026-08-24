import os
import httpx
import sqlite3
import base64
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="MCP Server", version="1.0")

from dotenv import load_dotenv
load_dotenv()

COMPANIES_HOUSE_API_KEY = os.getenv("COMPANIES_HOUSE_API_KEY", "")
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
SANCTIONS_DB = os.path.join(DATA_DIR, "sanctions.db")
ADDR_DB = os.path.join(DATA_DIR, "known_addresses.db")

class CRNRequest(BaseModel):
    crn: str

class OFACRequest(BaseModel):
    name: str

def get_auth_headers():
    auth_string = f"{COMPANIES_HOUSE_API_KEY}:"
    encoded = base64.b64encode(auth_string.encode()).decode()
    return {"Authorization": f"Basic {encoded}"}

@app.post("/tools/fetch_uk_api")
async def fetch_uk_api(req: CRNRequest):
    crn = req.crn
    base_url = "https://api.company-information.service.gov.uk"
    
    async with httpx.AsyncClient() as client:
        headers = get_auth_headers()
        
        try:
            # 1. Company Profile
            comp_resp = await client.get(f"{base_url}/company/{crn}", headers=headers)
            if comp_resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Company not found")
            comp_resp.raise_for_status()
            comp_data = comp_resp.json()
            
            # 2. Officers
            off_resp = await client.get(f"{base_url}/company/{crn}/officers", headers=headers)
            off_data = off_resp.json() if off_resp.status_code == 200 else {"items": []}
            
            # 3. PSCs
            psc_resp = await client.get(f"{base_url}/company/{crn}/persons-with-significant-control", headers=headers)
            psc_data = psc_resp.json() if psc_resp.status_code == 200 else {"items": []}
            
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"Companies House API error: {e.response.status_code}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    # Process Company Data
    company_name = comp_data.get("company_name", "")
    incorp_date = comp_data.get("date_of_creation", "")
    sic_codes = comp_data.get("sic_codes", [])
    reg_addr_dict = comp_data.get("registered_office_address", {})
    raw_addr = ", ".join([str(v) for v in reg_addr_dict.values() if v])
    filing_count = comp_data.get("undeliverable_registered_office_address", False) 
    
    # Process Officers
    officers = []
    for item in off_data.get("items", []):
        officers.append({
            "name": item.get("name", ""),
            "role": item.get("officer_role", ""),
            "appointment_date": item.get("appointed_on", ""),
            "resignation_date": item.get("resigned_on", None),
            "is_corporate": item.get("officer_role", "").endswith("corporate")
        })
        
    # Process PSCs
    pscs = []
    for item in psc_data.get("items", []):
        natures = item.get("natures_of_control", [])
        
        pct_band = "0-0-percent"
        pct_val = 0.0
        for n in natures:
            if "ownership-of-shares" in n:
                pct_band = n
                try:
                    parts = n.split("-")
                    if "25" in parts and "50" in parts: pct_val = 37.5
                    elif "50" in parts and "75" in parts: pct_val = 62.5
                    elif "75" in parts: pct_val = 87.5
                    else: pct_val = 0.0
                except: pct_val = 0.0
                break
                
        jurisdiction = item.get("address", {}).get("country", item.get("country_of_residence", ""))
        if jurisdiction is None: jurisdiction = ""
        is_offshore = jurisdiction.lower() not in ["england", "wales", "scotland", "northern ireland", "united kingdom", ""]
        
        pscs.append({
            "name": item.get("name", ""),
            "type": item.get("kind", ""),
            "ownership_band": pct_band,
            "ownership_pct": pct_val,
            "jurisdiction": jurisdiction,
            "natures_of_control": natures,
            "is_offshore": is_offshore
        })
        
    return {
        "company_name": company_name,
        "crn": crn,
        "incorporation_date": incorp_date,
        "sic_codes": sic_codes,
        "registered_address": raw_addr,
        "raw_address_string": raw_addr,
        "officers": officers,
        "pscs": pscs,
        "filing_count": 0 
    }

@app.post("/tools/query_ofac")
async def query_ofac(req: OFACRequest):
    try:
        conn = sqlite3.connect(SANCTIONS_DB)
        cursor = conn.cursor()
        cursor.execute("SELECT full_name, program FROM sdn_list WHERE LOWER(full_name) LIKE LOWER(?) LIMIT 1", (f"%{req.name}%",))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "match": True,
                "detail": f"{row[0]} - {row[1]}",
                "program": row[1],
                "matched_name": row[0]
            }
        else:
            return {
                "match": False,
                "detail": "",
                "program": "",
                "matched_name": ""
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tools/known_addresses")
async def known_addresses():
    try:
        conn = sqlite3.connect(ADDR_DB)
        cursor = conn.cursor()
        cursor.execute("SELECT address FROM shell_addresses")
        rows = cursor.fetchall()
        conn.close()
        return {"addresses": [r[0] for r in rows]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
