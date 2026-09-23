# Ambient Expense-Approval Agent (ADK 2.0 Graph Workflow)

An event-driven ambient agent built using the **Google Agent Development Kit (ADK 2.0)** graph workflow engine.

---

## Business Rule & Routing Architecture

1. **Under 1000 INR**: Auto-approved instantly with **zero LLM involvement**.
2. **1000 INR or More**: Escalated to an **LLM reviewer** for risk assessment, followed by a **Human-in-the-Loop (HITL) pause** via ADK 2.0 `RequestInput`. Execution cleanly resumes once the human submits their approval or rejection.
3. **Separation of Concerns**: The threshold check (`amount < 1000`) and edge routing are enforced strictly in deterministic Python code. The LLM is used **strictly for qualitative risk judgment** and never makes routing or threshold decisions.

```
                      [Incoming Expense Event]
                                 │
                                 ▼
                   [evaluate_expense_threshold]
                                 │
        ┌────────────────────────┴────────────────────────┐
        │ (< 1000 INR)                                    │ (>= 1000 INR)
        ▼                                                 ▼
  [auto_approve]                                [llm_risk_reviewer]
  (Zero LLM calls)                                (Risk Judgment)
        │                                                 │
        ▼                                                 ▼
 [AUTO_APPROVED]                            [human_approval_checkpoint]
                                             (Yields RequestInput: PAUSE)
                                                          │
                                                          ▼ (Human Approver: Resumes)
                                                  [finalize_decision]
                                                          │
                                                          ▼
                                                [APPROVED / REJECTED]
```

---

## Directory Structure

```
.
├── expense_approval/
│   ├── __init__.py           # Package exports
│   ├── models.py             # Pydantic schemas: ExpenseReport, RiskAssessment, HumanDecision, WorkflowResult
│   ├── reviewer.py           # LLM Risk Reviewer (Gemini 2.5 Flash via google-genai + offline fallback)
│   ├── workflow.py           # ADK 2.0 Graph Workflow (START, nodes, conditional edges, RequestInput)
│   └── engine.py             # AmbientExpenseEngine (event ingestion, runner, pause & resume)
├── tests/
│   └── test_workflow.py      # Pytest test cases (auto-approval, boundary at 1000, HITL approve/reject)
├── demo.py                   # End-to-end interactive demonstration
└── README.md
```

---

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   pip install google-adk google-genai pytest pytest-asyncio pydantic
   ```

2. **Configure Gemini API Key (Optional)**:
   ```bash
   export GEMINI_API_KEY="your-api-key-here"
   ```
   *Note: If no API key is set, the system runs with a deterministic heuristic auditor so that test suites and offline demos work out of the box.*

---

## Running the Code

### 1. Run the Interactive Demo
```bash
python3 demo.py
```

### 2. Run the Automated Test Suite
```bash
pytest -v tests/test_workflow.py
```

---

## Python API Usage

```python
import asyncio
from expense_approval import AmbientExpenseEngine, HumanDecision

async def main():
    engine = AmbientExpenseEngine()

    # 1. Expense under 1000 INR: Auto-approved immediately
    result_small = await engine.process_expense_event({
        "amount": 350.0,
        "submitter": "alice@company.com",
        "category": "Office Supplies",
        "description": "Notebooks and pens",
        "date": "2026-09-23",
        "currency": "INR",
    })
    print(result_small.status)  # ApprovalStatus.AUTO_APPROVED

    # 2. Expense >= 1000 INR: Pauses for human approval
    result_large = await engine.process_expense_event({
        "amount": 4200.0,
        "submitter": "bob@company.com",
        "category": "Software",
        "description": "Development tool license",
        "date": "2026-09-23",
        "currency": "INR",
    })
    print(result_large.is_paused)       # True
    print(result_large.risk_assessment) # RiskAssessment(risk_level=..., ...)

    # 3. Resume when human reviews
    final_result = await engine.resume_human_decision(
        session_id=result_large.session_id,
        invocation_id=result_large.invocation_id,
        interrupt_id=result_large.interrupt_id,
        decision=HumanDecision(action="APPROVE", reviewer_notes="Approved for dev team"),
    )
    print(final_result.status)  # ApprovalStatus.APPROVED

asyncio.run(main())
```
