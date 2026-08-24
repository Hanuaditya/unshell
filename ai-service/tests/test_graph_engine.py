import pytest
import networkx as nx
from graph_engine import (
    build_graph,
    calculate_risk_vectors,
    compute_final_score,
    export_cytoscape,
    RISK_CIRCULAR_OWNERSHIP,
    RISK_HIGH_RISK_JURISDICTION,
    RISK_OFFSHORE_SHELL,
    RISK_AI_UNVERIFIED
)

def get_test_data():
    nodes = [
        {"id": "n1", "label": "Corp A", "jurisdiction": "bvi", "trust_score": 1.0},
        {"id": "n2", "label": "Corp B", "jurisdiction": "iran", "trust_score": 1.0},
        {"id": "n3", "label": "Corp C", "jurisdiction": "uk", "trust_score": 0.5},
        {"id": "n4", "label": "Safe Corp", "jurisdiction": "us", "trust_score": 1.0}
    ]
    edges = [
        {"source": "n1", "target": "n2", "label": "owns", "ownership_pct": 50},
        {"source": "n2", "target": "n3", "label": "owns", "ownership_pct": 100},
        {"source": "n3", "target": "n1", "label": "owns", "ownership_pct": 30}, # Cycle!
        {"source": "n4", "target": "n1", "label": "owns", "ownership_pct": 100}
    ]
    return nodes, edges

def test_g1_build_graph():
    nodes, edges = get_test_data()
    G = build_graph(nodes, edges)
    
    assert isinstance(G, nx.DiGraph)
    assert len(G.nodes) == 4
    assert len(G.edges) == 4
    assert G.nodes["n1"]["jurisdiction"] == "bvi"

def test_g2_risk_vectors():
    nodes, edges = get_test_data()
    G = build_graph(nodes, edges)
    G_risk = calculate_risk_vectors(G)
    
    # n1: bvi (offshore) + cycle
    assert "OFFSHORE_SHELL_ENTITY" in G_risk.nodes["n1"]["risk_vectors"]
    assert "CIRCULAR_OWNERSHIP_DETECTED" in G_risk.nodes["n1"]["risk_vectors"]
    assert G_risk.nodes["n1"]["base_risk"] == RISK_OFFSHORE_SHELL + RISK_CIRCULAR_OWNERSHIP
    
    # n2: iran (high risk) + cycle
    assert "HIGH_RISK_JURISDICTION" in G_risk.nodes["n2"]["risk_vectors"]
    assert G_risk.nodes["n2"]["base_risk"] == RISK_HIGH_RISK_JURISDICTION + RISK_CIRCULAR_OWNERSHIP
    
    # n3: uk (safe) + low trust + cycle
    assert "AI_UNVERIFIED_CLAIM" in G_risk.nodes["n3"]["risk_vectors"]
    assert G_risk.nodes["n3"]["base_risk"] == RISK_AI_UNVERIFIED + RISK_CIRCULAR_OWNERSHIP
    
    # n4: us (safe) + no cycle (it only points to cycle)
    assert G_risk.nodes["n4"]["base_risk"] == 0.0
    assert len(G_risk.nodes["n4"]["risk_vectors"]) == 0

def test_g3_compute_score():
    nodes, edges = get_test_data()
    G = build_graph(nodes, edges)
    G_risk = calculate_risk_vectors(G)
    
    final_score = compute_final_score(G_risk)
    
    # Highest risk node is n2 (25 + 40 = 65)
    # wait n1 is 15 + 40 = 55
    # n3 is 20 + 40 = 60
    assert final_score == 65.0

def test_g4_export_cytoscape():
    nodes, edges = get_test_data()
    G = build_graph(nodes, edges)
    G_risk = calculate_risk_vectors(G)
    
    cyto = export_cytoscape(G_risk)
    assert "elements" in cyto
    # 4 nodes + 4 edges = 8 elements
    assert len(cyto["elements"]) == 8
    
    # Verify strict formatting
    n1_element = next(e for e in cyto["elements"] if e["data"].get("id") == "n1")
    assert n1_element["data"]["jurisdiction"] == "bvi"
    assert n1_element["data"]["riskScore"] == 55.0
