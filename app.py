"""FastAPI Web Server for Ambient Expense-Approval Agent (ADK 2.0).

Exposes REST APIs for event ingestion, human decision resumption, and dashboard statistics,
while serving the interactive frontend dashboard.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from expense_approval import (
    AmbientExpenseEngine,
    ApprovalStatus,
    ExpenseReport,
    HumanDecision,
    WorkflowResult,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("expense_agent_server")

app = FastAPI(
    title="Ambient Expense-Approval Agent (ADK 2.0)",
    description="Graph-based workflow engine for ambient expense processing with deterministic thresholding and LLM risk review.",
    version="2.0.0",
)

# Enable CORS for local testing and web integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Instantiate the ambient workflow engine
engine = AmbientExpenseEngine()

# In-memory store for recent audit trail & dashboard history
audit_history: List[Dict[str, Any]] = []


@app.post("/api/expenses", response_model=WorkflowResult)
async def submit_expense(expense_data: ExpenseReport) -> WorkflowResult:
    """Ingests a new expense JSON event and runs the ADK 2.0 graph workflow."""
    try:
        result = await engine.process_expense_event(expense_data)
        
        # Record in history (update existing or append new)
        existing_idx = next(
            (i for i, item in enumerate(audit_history) if item["session_id"] == result.session_id),
            None,
        )
        record = result.model_dump(mode="json")
        if existing_idx is not None:
            audit_history[existing_idx] = record
        else:
            audit_history.insert(0, record)

        return result
    except Exception as e:
        logger.exception("Error processing expense: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expenses/batch", response_model=List[WorkflowResult])
async def submit_batch_expenses(expenses: List[ExpenseReport]) -> List[WorkflowResult]:
    """Ingests multiple expense events sequentially and returns results."""
    try:
        results: List[WorkflowResult] = []
        for expense_data in expenses:
            result = await engine.process_expense_event(expense_data)
            record = result.model_dump(mode="json")
            existing_idx = next(
                (i for i, item in enumerate(audit_history) if item["session_id"] == result.session_id),
                None,
            )
            if existing_idx is not None:
                audit_history[existing_idx] = record
            else:
                audit_history.insert(0, record)
            results.append(result)
        return results
    except Exception as e:
        logger.exception("Error processing batch expenses: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/expenses/{session_id}/decision", response_model=WorkflowResult)
async def submit_decision(
    session_id: str,
    decision_payload: Dict[str, Any],
) -> WorkflowResult:
    """Resumes an interrupted workflow at the human approval checkpoint."""
    invocation_id = decision_payload.get("invocation_id")
    interrupt_id = decision_payload.get("interrupt_id")
    action = decision_payload.get("action")
    notes = decision_payload.get("reviewer_notes", "")
    reviewer_id = decision_payload.get("reviewer_id", "manager_web")

    if not invocation_id or not interrupt_id or not action:
        raise HTTPException(
            status_code=400,
            detail="Missing required fields: invocation_id, interrupt_id, and action are mandatory.",
        )

    try:
        human_decision = HumanDecision(
            action=action,
            reviewer_notes=notes,
            reviewer_id=reviewer_id,
        )

        final_result = await engine.resume_human_decision(
            session_id=session_id,
            invocation_id=invocation_id,
            interrupt_id=interrupt_id,
            decision=human_decision,
        )

        # Update in history
        existing_idx = next(
            (i for i, item in enumerate(audit_history) if item["session_id"] == session_id),
            None,
        )
        record = final_result.model_dump(mode="json")
        if existing_idx is not None:
            audit_history[existing_idx] = record
        else:
            audit_history.insert(0, record)

        return final_result
    except Exception as e:
        logger.exception("Error resuming human decision: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/expenses")
async def get_expenses() -> List[Dict[str, Any]]:
    """Returns the full history of processed and pending expense workflows."""
    return audit_history


@app.get("/api/stats")
async def get_dashboard_stats() -> Dict[str, Any]:
    """Returns real-time aggregated metrics."""
    total = len(audit_history)
    auto_approved = sum(1 for e in audit_history if e.get("status") == ApprovalStatus.AUTO_APPROVED.value)
    human_approved = sum(1 for e in audit_history if e.get("status") == ApprovalStatus.APPROVED.value)
    rejected = sum(1 for e in audit_history if e.get("status") == ApprovalStatus.REJECTED.value)
    pending = sum(1 for e in audit_history if e.get("status") == ApprovalStatus.PENDING_HUMAN_APPROVAL.value)
    total_amount = sum(float(e.get("expense", {}).get("amount", 0.0)) for e in audit_history)

    return {
        "total_processed": total,
        "auto_approved": auto_approved,
        "human_approved": human_approved,
        "rejected": rejected,
        "pending_human_review": pending,
        "total_amount_inr": round(total_amount, 2),
        "threshold_rule_inr": 1000.0,
    }


# Mount static directory for frontend
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def serve_index():
    """Serves the dashboard index page."""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "ADK 2.0 Expense Agent API is active. Static frontend initializing."}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
