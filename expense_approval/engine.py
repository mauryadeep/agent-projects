"""Ambient Expense Approval Engine orchestrating ADK 2.0 graph workflow execution."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Optional, Union

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from .models import (
    ApprovalStatus,
    ExpenseReport,
    HumanDecision,
    RiskAssessment,
    WorkflowResult,
)
from .reviewer import LlmRiskReviewer
from .workflow import create_expense_workflow

logger = logging.getLogger(__name__)


class AmbientExpenseEngine:
    """Ambient event listener and workflow executor for expense approvals."""

    def __init__(
        self,
        reviewer: Optional[LlmRiskReviewer] = None,
        threshold_inr: float = 1000.0,
        app_name: str = "ambient_expense_approval",
    ):
        self.app_name = app_name
        self.threshold_inr = threshold_inr
        self.reviewer = reviewer or LlmRiskReviewer()
        self.session_service = InMemorySessionService()
        self.workflow = create_expense_workflow(
            reviewer=self.reviewer,
            threshold_inr=self.threshold_inr,
        )
        self.runner = Runner(
            node=self.workflow,
            session_service=self.session_service,
            app_name=self.app_name,
        )

    async def process_expense_event(
        self,
        event_data: Union[dict[str, Any], ExpenseReport],
        user_id: str = "ambient_system",
    ) -> WorkflowResult:
        """Ingests an incoming expense report JSON event and executes the ADK 2.0 workflow.

        - If amount < 1000 INR: Auto-approves instantly in Python with zero LLM involvement.
        - If amount >= 1000 INR: Evaluates risk via LLM and pauses execution for human approval.
        """
        if isinstance(event_data, dict):
            expense = ExpenseReport.model_validate(event_data)
        else:
            expense = event_data

        if not expense.expense_id:
            expense.expense_id = f"exp_{uuid.uuid4().hex[:8]}"

        session = await self.session_service.create_session(
            app_name=self.app_name,
            user_id=user_id,
        )

        initial_message = types.Content(
            role="user",
            parts=[types.Part(text=f"Process expense #{expense.expense_id}")],
        )

        is_interrupted = False
        interrupt_id = None
        interrupted_invocation_id = None
        prompt_message = None

        logger.info(
            "Ambient engine starting workflow for expense #%s (₹%.2f) in session %s",
            expense.expense_id,
            expense.amount,
            session.id,
        )

        async for event in self.runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=initial_message,
            state_delta={"expense": expense.model_dump()},
        ):
            if event.long_running_tool_ids:
                is_interrupted = True
                interrupt_id = list(event.long_running_tool_ids)[0]
                interrupted_invocation_id = event.invocation_id

                # Extract request prompt message if available
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.function_call and part.function_call.args:
                            prompt_message = part.function_call.args.get("message")

        # Reload updated session state
        updated_session = await self.session_service.get_session(
            app_name=self.app_name,
            user_id=user_id,
            session_id=session.id,
        )
        state = updated_session.state or {}

        if is_interrupted:
            raw_risk = state.get("risk_assessment")
            risk = RiskAssessment.model_validate(raw_risk) if raw_risk else None

            return WorkflowResult(
                session_id=session.id,
                status=ApprovalStatus.PENDING_HUMAN_APPROVAL,
                is_paused=True,
                invocation_id=interrupted_invocation_id,
                interrupt_id=interrupt_id,
                prompt_message=prompt_message,
                expense=expense,
                risk_assessment=risk,
                reason="Expense meets or exceeds ₹1000 INR threshold. Workflow paused for human approval.",
            )

        status_str = state.get("status", ApprovalStatus.AUTO_APPROVED.value)
        completed_at = state.get("completed_at")

        return WorkflowResult(
            session_id=session.id,
            status=ApprovalStatus(status_str),
            is_paused=False,
            expense=expense,
            reason=state.get("reason"),
            completed_at=completed_at,
        )

    async def resume_human_decision(
        self,
        session_id: str,
        invocation_id: str,
        interrupt_id: str,
        decision: Union[dict[str, Any], HumanDecision],
        user_id: str = "ambient_system",
    ) -> WorkflowResult:
        """Resumes a paused workflow when a human submits an approval or rejection decision."""
        if isinstance(decision, dict):
            human_decision = HumanDecision.model_validate(decision)
        else:
            human_decision = decision

        resume_content = types.Content(
            role="user",
            parts=[
                types.Part(
                    function_response=types.FunctionResponse(
                        id=interrupt_id,
                        name="adk_request_input",
                        response=human_decision.model_dump(),
                    )
                )
            ],
        )

        logger.info(
            "Resuming paused workflow in session %s with human decision: %s",
            session_id,
            human_decision.action,
        )

        async for _ in self.runner.run_async(
            user_id=user_id,
            session_id=session_id,
            invocation_id=invocation_id,
            new_message=resume_content,
        ):
            pass

        updated_session = await self.session_service.get_session(
            app_name=self.app_name,
            user_id=user_id,
            session_id=session_id,
        )
        state = updated_session.state or {}

        raw_expense = state.get("expense", {})
        expense = ExpenseReport.model_validate(raw_expense)

        raw_risk = state.get("risk_assessment")
        risk = RiskAssessment.model_validate(raw_risk) if raw_risk else None

        status_str = state.get("status", ApprovalStatus.APPROVED.value)
        completed_at = state.get("completed_at")

        return WorkflowResult(
            session_id=session_id,
            status=ApprovalStatus(status_str),
            is_paused=False,
            expense=expense,
            risk_assessment=risk,
            human_decision=human_decision,
            reason=state.get("reason"),
            completed_at=completed_at,
        )
