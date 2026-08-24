import os
import sys
import json
import logging
from pathlib import Path

# Add backend directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rag_engine import run_rag_pipeline

# Configure a clean console logger
logging.basicConfig(level=logging.WARNING, format='%(levelname)s: %(message)s')

def test_local_pdfs():
    data_dir = Path(__file__).parent.parent / "data" / "test_pdfs"
    
    if not data_dir.exists():
        print(f"Directory not found: {data_dir}")
        return

    pdf_files = list(data_dir.glob("*.pdf"))
    
    if not pdf_files:
        print(f"[!] No PDFs found in {data_dir}. Please upload some PDFs and run again.")
        return

    print(f"Found {len(pdf_files)} PDF(s). Booting Hyper-RAG Pipeline...\n")
    print("=" * 60)

    for pdf_file in pdf_files:
        print(f"📄 Processing: {pdf_file.name}")
        try:
            with open(pdf_file, "rb") as f:
                pdf_bytes = f.read()

            print("   -> Extracting and verifying (this may take 15-30 seconds via NVIDIA NIM)...")
            result = run_rag_pipeline(pdf_bytes)

            print("\n   [ VERIFIED NODES ]")
            for node in result.get("discovered_nodes", []):
                print(f"      - {node['label']} ({node['type']}) [Trust: {node['trust_score']}]")

            print("\n   [ VERIFIED RELATIONSHIPS ]")
            for edge in result.get("discovered_edges", []):
                print(f"      - {edge['source']} --[{edge['label']}]--> {edge['target']} ({edge['ownership_pct']}%)")
            
            print("\n   [ STATS ]")
            stats = result.get("verification_stats", {})
            print(f"      - Total Claims: {stats.get('total_claims')}")
            print(f"      - Verified: {stats.get('verified')} / Dropped: {stats.get('dropped')}")
            print(f"      - Overall Confidence Score: {result.get('overall_confidence_score')}%")
            
            if result.get("offshore_dead_end"):
                print(f"      - ⚠️ HITL Triggered: {result.get('hitl_reason')}")

            if result.get("rag_warnings"):
                print(f"      - Warnings: {result.get('rag_warnings')}")

        except Exception as e:
            print(f"   [!] Error processing {pdf_file.name}: {str(e)}")
            
        print("=" * 60)

if __name__ == "__main__":
    test_local_pdfs()
