"""Comprehensive tests for the Ambient Expense-Approval Agent (ADK 2.0)."""

from unittest.mock import AsyncMock, patch
import pytest
from pydantic import ValidationError

from expense_approval import (
    AmbientExpenseEngine,
    ApprovalStatus,
    ExpenseReport,
    HumanDecision,
    LlmRiskReviewer,
    RiskAssessment,
)


@pytest.fixture
def engine():
    """Provides a fresh AmbientExpenseEngine instance."""
    return AmbientExpenseEngine()


@pytest.mark.asyncio
async def test_under_1000_auto_approve_no_llm(engine):
    """Test Rule 1: Under 1000 INR must auto-approve instantly with zero LLM calls."""
    spy_reviewer = LlmRiskReviewer()
    spy_reviewer.assess_risk = AsyncMock()
    test_engine = AmbientExpenseEngine(reviewer=spy_reviewer)

    expense_data = {
        "amount": 450.0,
        "submitter": "rahul.sharma@example.com",
        "category": "Meals & Entertainment",
        "description": "Coffee and working lunch with vendor",
        "date": "2026-09-23",
        "currency": "INR",
    }

    result = await test_engine.process_expense_event(expense_data)

    # Verify auto-approval
    assert result.status == ApprovalStatus.AUTO_APPROVED
    assert result.is_paused is False
    assert result.is_final is True
    assert result.completed_at is not None
    assert "Instantly auto-approved" in (result.reason or "")

    # CRITICAL: Verify the LLM was NEVER invoked
    spy_reviewer.assess_risk.assert_not_called()
    assert result.risk_assessment is None


@pytest.mark.asyncio
async def test_boundary_exact_1000_triggers_review(engine):
    """Test Boundary: Exactly 1000 INR must escalate to LLM and pause for human review."""
    expense_data = {
        "amount": 1000.0,
        "submitter": "priya.nair@example.com",
        "category": "Office Supplies",
        "description": "Ergonomic keyboard wrist rest and stationery",
        "date": "2026-09-23",
        "currency": "INR",
    }

    result = await engine.process_expense_event(expense_data)

    # Must NOT auto-approve; must escalate and pause
    assert result.status == ApprovalStatus.PENDING_HUMAN_APPROVAL
    assert result.is_paused is True
    assert result.is_final is False
    assert result.interrupt_id is not None
    assert result.invocation_id is not None

    # LLM risk assessment must be populated
    assert result.risk_assessment is not None
    assert result.risk_assessment.risk_level in ["LOW", "MEDIUM", "HIGH"]
    assert 0.0 <= result.risk_assessment.risk_score <= 1.0


@pytest.mark.asyncio
async def test_over_1000_human_approve_cycle(engine):
    """Test full cycle: Expense >= 1000 INR -> LLM risk assessment -> Pause -> Human Approves -> Resumes."""
    expense_data = {
        "amount": 3500.0,
        "submitter": "vikram.singh@example.com",
        "category": "Software Subscriptions",
        "description": "Annual GitHub Copilot team subscription license",
        "date": "2026-09-23",
        "currency": "INR",
    }

    # Step 1: Ambient event ingestion
    initial_result = await engine.process_expense_event(expense_data)

    assert initial_result.status == ApprovalStatus.PENDING_HUMAN_APPROVAL
    assert initial_result.is_paused is True
    assert initial_result.risk_assessment is not None
    assert initial_result.prompt_message is not None

    # Step 2: Human manager reviews risk analysis and submits APPROVAL
    decision = HumanDecision(
        action="APPROVE",
        reviewer_notes="Approved: Required for engineering productivity.",
        reviewer_id="manager_arun",
    )

    final_result = await engine.resume_human_decision(
        session_id=initial_result.session_id,
        invocation_id=initial_result.invocation_id,
        interrupt_id=initial_result.interrupt_id,
        decision=decision,
    )

    # Step 3: Verify workflow completed with APPROVED status
    assert final_result.status == ApprovalStatus.APPROVED
    assert final_result.is_paused is False
    assert final_result.is_final is True
    assert final_result.human_decision is not None
    assert final_result.human_decision.action == "APPROVE"
    assert "manager_arun" in (final_result.reason or "")
    assert final_result.completed_at is not None


@pytest.mark.asyncio
async def test_over_1000_human_reject_cycle(engine):
    """Test full cycle: High-risk expense >= 1000 INR -> Risk flagged -> Pause -> Human Rejects -> Resumes."""
    expense_data = {
        "amount": 14500.0,
        "submitter": "dev.kapoor@example.com",
        "category": "Miscellaneous",
        "description": "Personal luxury gift hamper for client festival celebration",
        "date": "2026-09-23",
        "currency": "INR",
    }

    initial_result = await engine.process_expense_event(expense_data)

    assert initial_result.status == ApprovalStatus.PENDING_HUMAN_APPROVAL
    assert initial_result.is_paused is True
    # Should identify high-risk indicators
    assert initial_result.risk_assessment.risk_level in ["MEDIUM", "HIGH"]
    assert len(initial_result.risk_assessment.flags) > 0

    # Human manager rejects the non-compliant expense
    decision = HumanDecision(
        action="REJECT",
        reviewer_notes="Rejected: Policy forbids personal luxury items. Submit itemized client receipt.",
        reviewer_id="finance_director",
    )

    final_result = await engine.resume_human_decision(
        session_id=initial_result.session_id,
        invocation_id=initial_result.invocation_id,
        interrupt_id=initial_result.interrupt_id,
        decision=decision,
    )

    assert final_result.status == ApprovalStatus.REJECTED
    assert final_result.is_paused is False
    assert final_result.is_final is True
    assert final_result.human_decision.action == "REJECT"
    assert "finance_director" in (final_result.reason or "")


def test_invalid_expense_payload_validation():
    """Verify input validation handles malformed data gracefully."""
    # Negative amount
    with pytest.raises(ValidationError):
        ExpenseReport(
            amount=-50.0,
            submitter="bad@example.com",
            category="Meals",
            description="Lunch",
            date="2026-09-23",
        )

    # Missing mandatory submitter
    with pytest.raises(ValidationError):
        ExpenseReport(
            amount=500.0,
            submitter="",
            category="Meals",
            description="Lunch",
            date="2026-09-23",
        )
