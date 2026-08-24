import os
import re
import json
from pydantic import BaseModel
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from dotenv import load_dotenv

load_dotenv()


class NormalizedNode(BaseModel):
    id: str
    label: str
    type: str
    jurisdiction: str
    risk_level: str
    incorporation_date: str | None
    sic_codes: list[str]


class NormalizedEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str
    ownership_pct: float
    trust_score: float
    evidence_snippet: str
    source_doc: str
    source_page: int | None


class NormalizedGraph(BaseModel):
    nodes: list[NormalizedNode]
    edges: list[NormalizedEdge]


# LLMs will be initialized lazily to avoid startup crashes if API is unreachable

_SYSTEM = """You are a data normalisation engine for an AML compliance system.
You receive raw JSON from the UK Companies House API and must map it to a strict graph schema.

Rules:
- DO NOT hallucinate. ONLY create nodes and edges for entities that explicitly exist in the provided JSON data.
- Each company, PSC, and active officer explicitly found in the JSON becomes a node.
- Each PSC relationship becomes a directed edge (PSC → company, ownership_pct from band midpoint).
- Each officer relationship becomes a directed edge (officer → company, ownership_pct = 0, trust_score = 1.0).
- node id: slugified lowercase name (spaces → underscores, special chars removed).
- risk_level for all nodes: "UNVERIFIED" until graph engine scores them.
- trust_score for API-sourced edges: 1.0 always.
- evidence_snippet: the exact Companies House field/value that proves this relationship.
- source_doc: "Companies House API".
- If ownership_band is a range like "25% to 50%", use midpoint (37.5).
- NEVER guess URLs, IDs, or extra entities not found in the source text.

You MUST output ONLY a pure JSON object matching this required structure exactly:
{
  "nodes": [
    {
      "id": "string",
      "label": "string",
      "type": "string",
      "jurisdiction": "string",
      "risk_level": "string",
      "incorporation_date": "string or null",
      "sic_codes": ["string"]
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "string",
      "target": "string",
      "label": "string",
      "ownership_pct": 0.0,
      "trust_score": 1.0,
      "evidence_snippet": "string",
      "source_doc": "string",
      "source_page": null
    }
  ]
}

Return ONLY the raw JSON object. Do not include markdown formatting like ```json, and never include explanations. Start with { and end with }.
"""


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "_", name.lower()).strip("_")


def normalize_companies_house_data(raw_data: dict) -> tuple[list[dict], list[dict]]:
    _llm = ChatNVIDIA(
        model="google/gemma-4-31b-it",
        nvidia_api_key=os.environ.get("NVIDIA_API_KEY", ""),
        temperature=0,
    )

    prompt = f"Normalise this Companies House data into the graph schema:\n\n{raw_data}"
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": prompt},
    ]
    
    result_msg = _llm.invoke(messages)
    content = result_msg.content.strip()
    
    # Strip markdown code blocks if the model hallucinates them despite instructions
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    
    try:
        data = json.loads(content)
        graph = NormalizedGraph(**data)
    except Exception as e:
        print(f"Failed to parse model output:\n{content}\nError: {e}")
        raise ValueError("Failed to parse Gemma output into strict JSON structure.")
        
    nodes = [n.model_dump() for n in graph.nodes]
    edges = [e.model_dump() for e in graph.edges]
    return nodes, edges
