import pytest
from unittest.mock import patch, MagicMock
from fpdf import FPDF
from pydantic import BaseModel, Field

from rag_engine import (
    pdf_ingest,
    embed_and_index,
    cross_verify_firewall,
    run_rag_pipeline,
    ExtractedEntity,
    ExtractedRelationship,
    OwnershipExtractionV2
)

def create_sample_pdf_bytes():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font('Helvetica', size=12)
    pdf.cell(200, 10, txt='Premier Directors Limited owns 100% of Atlantic Shell Corp BVI.', ln=True)
    pdf.cell(200, 10, txt='John Smith is appointed as beneficial owner with 75% shareholding.', ln=True)
    return bytes(pdf.output())

def test_r1_pdf_ingest():
    pdf_bytes = create_sample_pdf_bytes()
    result = pdf_ingest(pdf_bytes)
    
    assert "raw_blocks" in result
    assert len(result["raw_blocks"]) > 0
    assert result["total_pages"] == 1
    
    # Check if text is extracted
    text_found = any("Premier Directors Limited" in block["text"] for block in result["raw_blocks"])
    assert text_found, "Sample text should be extracted"

def test_r2_embed_and_index():
    raw_blocks = [
        {"page": 1, "bbox": "(0,0,10,10)", "text": "Premier Directors Limited owns 100% of Atlantic Shell Corp BVI.", "type": "text"},
        {"page": 1, "bbox": "(0,10,10,20)", "text": "John Smith is appointed as beneficial owner with 75% shareholding.", "type": "text"}
    ]
    result = embed_and_index(raw_blocks)
    
    assert "faiss_index" in result
    assert result["faiss_index"] is not None
    assert result["total_chunks"] > 0
    assert len(result["chunks"]) > 0
    
    # Test FAISS search
    docs = result["faiss_index"].similarity_search_with_score("owner percentage", k=1)
    assert len(docs) > 0

def test_r4_cross_verify_firewall():
    # Setup mock chunks
    chunks = [
        {"chunk_id": "chunk_0000", "page": 1, "text": "Premier Directors Limited owns 100% of Atlantic Shell Corp BVI.", "type": "text"},
        {"chunk_id": "chunk_0001", "page": 1, "text": "John Smith is appointed as beneficial owner with 75% shareholding.", "type": "text"}
    ]
    
    # Create raw extraction with 1 VERIFIED claim and 1 HALLUCINATED claim
    extraction = OwnershipExtractionV2(
        entities=[
            ExtractedEntity(
                name="Premier Directors Limited",
                entity_type="company",
                jurisdiction=None,
                incorporation_date=None,
                source_chunk_id="chunk_0000",
                source_page=1,
                confidence=0.9
            ),
            ExtractedEntity(
                name="Fake Hallucinated Company",
                entity_type="company",
                jurisdiction=None,
                incorporation_date=None,
                source_chunk_id="chunk_0001",
                source_page=1,
                confidence=0.8
            )
        ],
        relationships=[],
        extraction_warnings=[]
    )
    
    result = cross_verify_firewall(extraction, chunks)
    
    # 2 total entities -> 1 verified, 1 dropped. 1/2 verified = 50% score
    assert result["overall_confidence_score"] == 50.0
    assert result["verification_stats"]["total_claims"] == 2
    assert result["verification_stats"]["verified"] == 1
    assert result["verification_stats"]["dropped"] == 1
    
    # >30% unverified -> hitl triggered
    assert result["offshore_dead_end"] is True
    assert "1/2 claims unverifiable" in result["hitl_reason"]
    
    # verify the nodes
    assert len(result["discovered_nodes"]) == 1
    assert result["discovered_nodes"][0]["label"] == "Premier Directors Limited"
