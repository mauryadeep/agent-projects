"""ADK 2.0 Graph Workflow definition for ambient expense approval."""

from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Any, Optional

from google.adk.events import RequestInput
from google.adk.workflow import START, Workflow, node

from .models import ApprovalStatus, ExpenseReport, HumanDecision, RiskAssessment
from .reviewer import LlmRiskReviewer

logger = logging.getLogger(__name__)

# Strict rule configuration kept in Python code
THRESHOLD_INR = 1000.0

AUTO_APPROVE_ROUTE = "auto_approve"
LLM_REVIEW_ROUTE = "llm_risk_reviewer"


def create_expense_workflow(
    reviewer: Optional[LlmRiskReviewer] = None,
    threshold_inr: float = THRESHOLD_INR,
) -> Workflow:
    """Builds and returns the ADK 2.0 graph workflow for expense approval."""

    risk_reviewer = reviewer or LlmRiskReviewer()

    @node(name="evaluate_expense_threshold")
    def evaluate_expense_threshold(ctx) -> dict[str, Any]:
        """Deterministic Python routing node.

        Evaluates whether the expense amount is under threshold_inr.
        No LLM is invoked during this routing decision.
        """
        raw_expense = ctx.state.get("expense", {})
        expense = ExpenseReport.model_validate(raw_expense)
        amount = expense.amount

        logger.info(
            "Evaluating expense threshold: Amount = ₹%.2f, Threshold = ₹%.2f",
            amount,
            threshold_inr,
        )

        if amount < threshold_inr:
            ctx.route = AUTO_APPROVE_ROUTE
            route_reason = f"Amount ₹{amount:,.2f} is under auto-approval threshold ₹{threshold_inr:,.2f}"
        else:
            ctx.route = LLM_REVIEW_ROUTE
            route_reason = f"Amount ₹{amount:,.2f} is >= threshold ₹{threshold_inr:,.2f}; escalating to LLM risk reviewer"

        ctx.state["route_decision"] = {
            "amount": amount,
            "threshold": threshold_inr,
            "route": ctx.route,
            "reason": route_reason,
        }
        return ctx.state["route_decision"]

    @node(name="auto_approve")
    def auto_approve(ctx) -> dict[str, Any]:
        """Instantly auto-approves expenses under threshold with zero LLM involvement."""
        raw_expense = ctx.state.get("expense", {})
        expense = ExpenseReport.model_validate(raw_expense)

        ctx.state["status"] = ApprovalStatus.AUTO_APPROVED.value
        ctx.state["reason"] = (
            f"Instantly auto-approved: Expense of ₹{expense.amount:,.2f} {expense.currency} "
            f"for '{expense.description}' is below the ₹{threshold_inr:,.2f} review threshold."
        )
        ctx.state["completed_at"] = datetime.now(timezone.utc).isoformat()

        logger.info(
            "Auto-approved expense #%s for ₹%.2f without LLM",
            expense.expense_id or "N/A",
            expense.amount,
        )

        return {
            "status": ctx.state["status"],
            "reason": ctx.state["reason"],
            "completed_at": ctx.state["completed_at"],
        }

    @node(name="llm_risk_reviewer")
    async def llm_risk_reviewer_node(ctx) -> dict[str, Any]:
        """Invokes the LLM strictly for qualitative risk analysis."""
        raw_expense = ctx.state.get("expense", {})
        expense = ExpenseReport.model_validate(raw_expense)

        logger.info(
            "Escalated to LLM reviewer: Analyzing risk for ₹%.2f expense (%s)",
            expense.amount,
            expense.category,
        )

        assessment: RiskAssessment = await risk_reviewer.assess_risk(expense)
        ctx.state["risk_assessment"] = assessment.model_dump()

        logger.info(
            "LLM Risk Judgment complete: Level=%s, Score=%.2f, Recommendation=%s",
            assessment.risk_level,
            assessment.risk_score,
            assessment.recommendation,
        )

        return ctx.state["risk_assessment"]

    @node(name="human_approval_checkpoint", rerun_on_resume=False)
    def human_approval_checkpoint(ctx):
        """Pauses the workflow using ADK 2.0 RequestInput for human approval or rejection."""
        raw_expense = ctx.state.get("expense", {})
        expense = ExpenseReport.model_validate(raw_expense)
        risk = ctx.state.get("risk_assessment", {})

        exp_id = expense.expense_id or "exp"
        interrupt_id = f"human_approval_{exp_id}"

        prompt_msg = (
            f"ACTION REQUIRED: Expense Report requires Human Approval\n"
            f"Submitter: {expense.submitter}\n"
            f"Amount: ₹{expense.amount:,.2f} {expense.currency}\n"
            f"Category: {expense.category}\n"
            f"Description: {expense.description}\n"
            f"Date: {expense.date}\n"
            f"----------------------------------------\n"
            f"LLM Risk Judgment: {risk.get('risk_level', 'N/A')} (Score: {risk.get('risk_score', 0.0)})\n"
            f"Model Recommendation: {risk.get('recommendation', 'N/A')}\n"
            f"Analysis Summary: {risk.get('analysis_summary', 'N/A')}\n"
            f"Audit Flags: {', '.join(risk.get('flags', [])) or 'None'}\n"
            f"----------------------------------------\n"
            f"Please respond with APPROVE or REJECT along with reviewer notes."
        )

        logger.info("Pausing workflow at Human Approval Checkpoint: interrupt_id=%s", interrupt_id)

        yield RequestInput(
            interrupt_id=interrupt_id,
            message=prompt_msg,
            payload={
                "expense": expense.model_dump(),
                "risk_assessment": risk,
            },
            response_schema=HumanDecision.model_json_schema(),
        )

    @node(name="finalize_decision")
    def finalize_decision(ctx, node_input: Any = None) -> dict[str, Any]:
        """Resumes after human review and updates the final decision."""
        raw_expense = ctx.state.get("expense", {})
        expense = ExpenseReport.model_validate(raw_expense)
        exp_id = expense.expense_id or "exp"
        interrupt_id = f"human_approval_{exp_id}"

        # Retrieve human input from resume payload
        human_input = (
            ctx.resume_inputs.get(interrupt_id)
            or (node_input if isinstance(node_input, dict) else None)
            or {}
        )

        # Unpack result wrapper if present
        if isinstance(human_input, dict) and "result" in human_input and isinstance(human_input["result"], dict):
            human_input = human_input["result"]

        decision = HumanDecision.model_validate(human_input)
        ctx.state["human_decision"] = decision.model_dump()
        ctx.state["completed_at"] = datetime.now(timezone.utc).isoformat()

        if decision.action == "APPROVE":
            ctx.state["status"] = ApprovalStatus.APPROVED.value
            ctx.state["reason"] = (
                f"Approved by {decision.reviewer_id} with notes: "
                f"'{decision.reviewer_notes or 'No notes provided'}'"
            )
        else:
            ctx.state["status"] = ApprovalStatus.REJECTED.value
            ctx.state["reason"] = (
                f"Rejected by {decision.reviewer_id} with notes: "
                f"'{decision.reviewer_notes or 'Policy non-compliance'}'"
            )

        logger.info(
            "Finalized human decision for expense #%s: %s",
            exp_id,
            ctx.state["status"],
        )

        return {
            "status": ctx.state["status"],
            "human_decision": ctx.state["human_decision"],
            "reason": ctx.state["reason"],
            "completed_at": ctx.state["completed_at"],
        }

    # Assemble the ADK 2.0 Graph Workflow with conditional edges
    return Workflow(
        name="ambient_expense_approval_workflow",
        description="Ambient expense approval workflow with deterministic threshold routing and LLM risk review",
        edges=[
            (START, evaluate_expense_threshold),
            (
                evaluate_expense_threshold,
                {
                    AUTO_APPROVE_ROUTE: auto_approve,
                    LLM_REVIEW_ROUTE: llm_risk_reviewer_node,
                },
            ),
            (llm_risk_reviewer_node, human_approval_checkpoint),
            (human_approval_checkpoint, finalize_decision),
        ],
    )
