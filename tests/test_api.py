"""Tests for FastAPI server endpoints."""

from fastapi.testclient import TestClient
import pytest
from app import app

client = TestClient(app)


def test_index_serves_html():
    """Verify that root endpoint serves the HTML UI."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Ambient Expense Approval Agent" in response.text
    assert "ADK 2.0 Graph Workflow Visualizer" in response.text


def test_api_submit_under_1000():
    """Verify POST /api/expenses auto-approves under 1000 INR."""
    payload = {
        "amount": 350.0,
        "submitter": "test.auto@example.com",
        "category": "Meals & Entertainment",
        "description": "Team coffee meetup",
        "date": "2026-09-23",
        "currency": "INR",
    }
    response = client.post("/api/expenses", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "AUTO_APPROVED"
    assert data["is_paused"] is False
    assert "Instantly auto-approved" in data["reason"]


def test_api_submit_over_1000_and_resume():
    """Verify POST /api/expenses pauses over 1000 INR and resumes via /decision."""
    payload = {
        "amount": 4500.0,
        "submitter": "test.review@example.com",
        "category": "Cloud Infrastructure",
        "description": "Quarterly cloud storage backup tier",
        "date": "2026-09-23",
        "currency": "INR",
    }
    # Step 1: Submit expense
    response = client.post("/api/expenses", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "PENDING_HUMAN_APPROVAL"
    assert data["is_paused"] is True
    assert data["interrupt_id"] is not None
    assert data["invocation_id"] is not None

    session_id = data["session_id"]
    invocation_id = data["invocation_id"]
    interrupt_id = data["interrupt_id"]

    # Step 2: Resume with Human Decision
    decision_payload = {
        "invocation_id": invocation_id,
        "interrupt_id": interrupt_id,
        "action": "APPROVE",
        "reviewer_notes": "Validated against engineering budget",
        "reviewer_id": "manager_test",
    }
    resume_resp = client.post(f"/api/expenses/{session_id}/decision", json=decision_payload)
    assert resume_resp.status_code == 200
    resume_data = resume_resp.json()
    assert resume_data["status"] == "APPROVED"
    assert resume_data["is_paused"] is False


def test_api_stats():
    """Verify GET /api/stats returns accurate metrics."""
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_processed" in data
    assert "auto_approved" in data
    assert "pending_human_review" in data
    assert data["threshold_rule_inr"] == 1000.0
