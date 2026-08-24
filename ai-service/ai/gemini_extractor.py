"""
gemini_extractor.py — PDF → Ownership extraction
3-tier fallback chain:
  1. Google Gemini 2.5 Flash  (primary — best quality)
  2. NVIDIA NIM Gemma 4 27b   (fallback — free, multimodal)
  3. OpenRouter (Claude 3.5 Haiku) (last resort — always available)
"""
import os
import re
import json
import base64
from typing import Literal, Optional

import fitz
import requests
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
if os.environ.get("GEMINI_API_KEY"):
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])

NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "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")


class ExtractedEntity(BaseModel):
    name: str
    type: Literal["individual", "company", "trust", "foundation"]
    jurisdiction: str
    ownership_pct: float
    role: str
    evidence_snippet: str
    page_num: Optional[int]


class ExtractedRelationship(BaseModel):
    owner: str
    owned: str
    ownership_pct: float
    evidence_snippet: str
    page_num: Optional[int]
    trust_score: float = 0.4


class OwnershipExtraction(BaseModel):
    entities: list[ExtractedEntity]
    relationships: list[ExtractedRelationship]
    document_type: str
    extraction_confidence: float
    warnings: list[str]


EXTRACTION_PROMPT = """You are a forensic document analyst specialising in corporate ownership structures.
Analyse this document and extract ALL ownership relationships.

For each entity: full legal name, entity type (individual/company/trust/foundation),
jurisdiction, ownership percentage, role (director/shareholder/beneficial_owner/trustee),
and the exact sentence proving the relationship (evidence_snippet).

For each relationship: owner, owned, ownership_pct, exact evidence quote.

Be conservative — add uncertainty to warnings[].
If a name appears multiple times treat as the same entity.

Respond in JSON matching this schema exactly:
{
  "entities": [{"name":"","type":"individual","jurisdiction":"","ownership_pct":0.0,"role":"","evidence_snippet":"","page_num":null}],
  "relationships": [{"owner":"","owned":"","ownership_pct":0.0,"evidence_snippet":"","page_num":null,"trust_score":0.4}],
  "document_type": "confirmation_statement|incorporation_cert|trust_deed|other",
  "extraction_confidence": 0.0,
  "warnings": []
}

Return ONLY the raw JSON. No markdown, no explanation."""


def _pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page in doc:
        pix = page.get_pixmap(dpi=200)
        images.append(pix.tobytes("png"))
    doc.close()
    return images


def _parse_json_response(text: str) -> OwnershipExtraction:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return OwnershipExtraction.model_validate_json(text.strip())


# ── Tier 1: Google Gemini 2.5 Flash ──────────────────────────────────────────
def _extract_via_gemini(images: list[bytes]) -> OwnershipExtraction:
    model = genai.GenerativeModel("gemini-2.5-flash")
    parts = [EXTRACTION_PROMPT]
    for img in images:
        parts.append({"mime_type": "image/png", "data": img})
    response = model.generate_content(
        parts,
        generation_config={"response_mime_type": "application/json"},
    )
    return OwnershipExtraction.model_validate_json(response.text)


# ── Tier 2: NVIDIA NIM Gemma 4 27b (multimodal) ───────────────────────────────
def _extract_via_nvidia_gemma(images: list[bytes]) -> OwnershipExtraction:
    """Send images as base64 to NVIDIA NIM Gemma 4 27b."""
    content_parts = [{"type": "text", "text": EXTRACTION_PROMPT}]
    # Include first 3 pages max to stay within context limits
    for img_bytes in images[:3]:
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        content_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"}
        })

    payload = {
        "model": "google/gemma-4-27b-it",
        "messages": [{"role": "user", "content": content_parts}],
        "temperature": 0.0,
        "max_tokens": 2048,
    }
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json",
    }
    resp = requests.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]
    return _parse_json_response(text)


# ── Tier 3: OpenRouter (Claude 3.5 Haiku — always available) ─────────────────
def _extract_via_openrouter(images: list[bytes]) -> OwnershipExtraction:
    """Send images to OpenRouter Claude 3.5 Haiku as last resort."""
    content_parts = [{"type": "text", "text": EXTRACTION_PROMPT}]
    for img_bytes in images[:3]:
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        content_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"}
        })

    payload = {
        "model": "anthropic/claude-3.5-haiku",
        "messages": [{"role": "user", "content": content_parts}],
        "temperature": 0.0,
        "max_tokens": 2048,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://unshell.ai",
        "X-Title": "Project Fusion",
    }
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]
    return _parse_json_response(text)


# ── Main entry point ──────────────────────────────────────────────────────────
def extract_ownership_from_pdf(pdf_bytes: bytes) -> OwnershipExtraction:
    """
    3-tier fallback PDF extraction:
    Gemini 2.5 Flash → NVIDIA Gemma 4 → OpenRouter Claude 3.5 Haiku
    """
    images = _pdf_to_images(pdf_bytes)

    # Tier 1: Gemini
    try:
        print("[EXTRACT] Trying Gemini 2.5 Flash...")
        return _extract_via_gemini(images)
    except Exception as e:
        print(f"[EXTRACT] Gemini failed ({e}), trying NVIDIA Gemma 4...")

    # Tier 2: NVIDIA Gemma 4
    try:
        return _extract_via_nvidia_gemma(images)
    except Exception as e:
        print(f"[EXTRACT] NVIDIA Gemma 4 failed ({e}), trying OpenRouter...")

    # Tier 3: OpenRouter Claude
    return _extract_via_openrouter(images)


# ── Graph format converter ─────────────────────────────────────────────────────
def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "_", name.lower()).strip("_")


def convert_extraction_to_graph_format(
    extraction: OwnershipExtraction,
    document_name: str = "uploaded_document",
) -> tuple[list[dict], list[dict]]:
    nodes: list[dict] = []
    edges: list[dict] = []
    id_map: dict[str, str] = {}

    for entity in extraction.entities:
        node_id = _slugify(entity.name)
        id_map[entity.name] = node_id
        nodes.append({
            "id": node_id,
            "label": entity.name,
            "type": entity.type,
            "jurisdiction": entity.jurisdiction,
            "risk_level": "UNVERIFIED_AI",
            "incorporation_date": None,
            "sic_codes": [],
            "tags": ["PDF_VERIFIED"],
        })

    for idx, rel in enumerate(extraction.relationships):
        src = id_map.get(rel.owner, _slugify(rel.owner))
        tgt = id_map.get(rel.owned, _slugify(rel.owned))
        edges.append({
            "id": f"edge_{idx:03d}",
            "source": src,
            "target": tgt,
            "label": "owns",
            "ownership_pct": rel.ownership_pct,
            "trust_score": 0.4,
            "evidence_snippet": rel.evidence_snippet,
            "source_doc": document_name,
            "source_page": rel.page_num,
        })

    return nodes, edges
