"""Data models for ambient expense-approval agent."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, List, Literal, Optional
from pydantic import BaseModel, Field


class ApprovalStatus(str, Enum):
    AUTO_APPROVED = "AUTO_APPROVED"
    PENDING_HUMAN_APPROVAL = "PENDING_HUMAN_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ExpenseReport(BaseModel):
    """Incoming expense report JSON event."""

    amount: float = Field(
        ...,
        gt=0,
        description="Total expense amount (e.g. in INR).",
        examples=[450.0, 1500.0],
    )
    submitter: str = Field(
        ...,
        min_length=1,
        description="Name or email of the submitter.",
        examples=["alice@company.com"],
    )
    category: str = Field(
        ...,
        min_length=1,
        description="Expense category (e.g., Meals, Software, Travel, Supplies).",
        examples=["Meals & Entertainment", "Cloud Infrastructure"],
    )
    description: str = Field(
        ...,
        min_length=1,
        description="Detailed description or business justification for the expense.",
        examples=["Team lunch celebrating Q3 milestone"],
    )
    date: str = Field(
        ...,
        description="Date of the expense (YYYY-MM-DD or ISO 8601).",
        examples=["2026-09-23"],
    )
    currency: str = Field(
        default="INR",
        description="Currency code of the expense. Defaults to INR.",
    )
    expense_id: Optional[str] = Field(
        default=None,
        description="Optional unique identifier for the expense report.",
    )


class RiskAssessment(BaseModel):
    """Structured risk analysis produced strictly by the LLM reviewer."""

    risk_level: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        ...,
        description="Assessed risk tier based on amount, category, and context.",
    )
    risk_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Risk probability score between 0.0 (safe) and 1.0 (high risk).",
    )
    flags: List[str] = Field(
        default_factory=list,
        description="Specific policy flags, unusual patterns, or audit alerts identified.",
    )
    analysis_summary: str = Field(
        ...,
        description="Concise rationale explaining the risk judgment to the human approver.",
    )
    policy_compliance: bool = Field(
        ...,
        description="Whether the expense appears compliant with standard business expense guidelines.",
    )
    recommendation: Literal["APPROVE", "NEEDS_VERIFICATION", "REJECT"] = Field(
        ...,
        description="The model's non-binding recommendation for the human approver.",
    )


class HumanDecision(BaseModel):
    """Human approver decision payload when resuming the workflow."""

    action: Literal["APPROVE", "REJECT"] = Field(
        ...,
        description="Decision made by the human reviewer.",
    )
    reviewer_notes: Optional[str] = Field(
        default="",
        description="Optional notes or justification provided by the human reviewer.",
    )
    reviewer_id: Optional[str] = Field(
        default="human_manager",
        description="Identifier of the human reviewer.",
    )


class WorkflowResult(BaseModel):
    """Result returned to the ambient event caller after processing or pausing."""

    session_id: str
    status: ApprovalStatus
    is_paused: bool = False
    invocation_id: Optional[str] = None
    interrupt_id: Optional[str] = None
    prompt_message: Optional[str] = None
    expense: ExpenseReport
    risk_assessment: Optional[RiskAssessment] = None
    human_decision: Optional[HumanDecision] = None
    reason: Optional[str] = None
    completed_at: Optional[datetime] = None

    @property
    def is_final(self) -> bool:
        return self.status in {
            ApprovalStatus.AUTO_APPROVED,
            ApprovalStatus.APPROVED,
            ApprovalStatus.REJECTED,
        }
