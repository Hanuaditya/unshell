from rag_engine import run_rag_pipeline
from fpdf import FPDF

# Create minimal test PDF bytes
pdf = FPDF()
pdf.add_page()
pdf.set_font('Helvetica', size=12)
pdf.cell(200, 10, txt='Premier Directors Limited owns 100% of Atlantic Shell Corp BVI.', ln=True)
pdf.cell(200, 10, txt='John Smith is appointed as beneficial owner with 75% shareholding.', ln=True)
pdf_bytes = bytes(pdf.output())

result = run_rag_pipeline(pdf_bytes)
print('Nodes found:', len(result['discovered_nodes']))
print('Edges found:', len(result['discovered_edges']))
print('Confidence score:', result['overall_confidence_score'])
print('Verification stats:', result['verification_stats'])
assert result['overall_confidence_score'] >= 0, 'Score must be numeric'
print('[OK] RAG pipeline smoke test PASSED')
