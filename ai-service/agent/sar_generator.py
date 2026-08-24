"""
sar_generator.py — HITL SAR Pre-Drafting Assistant
Generates a factual, neutral Suspicious Activity Report (SAR) summary from verified graph data.
"""
import os
import json
from datetime import datetime, timezone
import google.generativeai as genai

# Reuse the existing Gemini setup
if os.environ.get("GEMINI_API_KEY"):
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])

SYSTEM_PROMPT = """You are an AML Compliance Assistant. You are given a forensic ownership graph,
a deterministic risk score, and the specific risk flags that fired.

Your job is to draft a factual, neutral Suspicious Activity Report (SAR) summary
for a human compliance officer to review, edit, and file at their own discretion.

Rules:
- State only what is present in the provided data. Never infer intent, guilt,
  or wrongdoing that is not explicitly supported by a flag or graph edge.
- Reference specific entities, jurisdictions, and dates from the graph data.
- If a circular ownership loop or OFAC match is present, describe it factually
  (e.g. "Entity X appears as both parent and subsidiary in the ownership chain")
  without characterizing it as fraud.
- End every draft with: "This is an AI-generated draft for human compliance
  review only. It does not constitute a legal or regulatory filing and must be
  independently verified before submission."
- Output format: Markdown with headers: Subject, Reporting Entity, Ownership
  Summary, Risk Indicators Identified, Recommended Human Actions, Disclaimer."""


def generate_sar_draft(
    crn: str,
    company_name: str,
    risk_score: int,
    fatal_flags: list,
    cumulative_vectors: list,
    graph_data: dict,
    resolved_ubo: str,
    sanctions_detail: str
) -> str:
    """
    Calls Gemini to generate a factual SAR draft based on the structured investigation data.
    """
    # Structure the input data for the LLM
    structured_input = {
        "crn": crn,
        "companyName": company_name,
        "riskScore": risk_score,
        "fatalFlags": fatal_flags,
        "cumulativeVectors": cumulative_vectors,
        "resolvedUbo": resolved_ubo,
        "sanctionsDetail": sanctions_detail,
        "graphData": graph_data,
    }

    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=SYSTEM_PROMPT
        )
        
        # Pass the structured JSON directly into the prompt to keep the model grounded
        response = model.generate_content(
            f"Please generate a SAR draft based on the following verified investigation data:\n\n```json\n{json.dumps(structured_input, indent=2)}\n```"
        )
        return response.text
    except Exception as e:
        print(f"[SAR_GENERATOR] LLM generation failed: {e}")
        raise e
