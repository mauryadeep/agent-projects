"""Interactive demonstration of the Ambient Expense-Approval Agent (ADK 2.0).

Demonstrates:
1. Expense < 1000 INR: Instant auto-approval with zero LLM involvement.
2. Expense >= 1000 INR: Evaluated by LLM reviewer for risk judgment, paused via
   ADK 2.0 RequestInput for human approval, and cleanly resumed upon human decision.
"""

import asyncio
import json
from expense_approval import AmbientExpenseEngine, HumanDecision


def print_banner(text: str) -> None:
    print("\n" + "=" * 70)
    print(f"  {text}")
    print("=" * 70)


def print_json(data: dict) -> None:
    print(json.dumps(data, indent=2, default=str))


async def run_demonstration():
    engine = AmbientExpenseEngine()

    print_banner("SCENARIO 1: Under 1000 INR - Instant Auto-Approval (Zero LLM)")

    # Ambient JSON Event arrives
    small_expense = {
        "amount": 420.0,
        "submitter": "amit.patel@acme.corp",
        "category": "Meals & Refreshments",
        "description": "Afternoon tea and snacks for client technical workshop",
        "date": "2026-09-23",
        "currency": "INR",
    }

    print("\n[Ambient Event Ingestion] Incoming Expense Event:")
    print_json(small_expense)

    result_1 = await engine.process_expense_event(small_expense)

    print(f"\n⚡ Decision: {result_1.status.value}")
    print(f"⚡ Reason: {result_1.reason}")
    print(f"⚡ LLM Invoked: {'YES' if result_1.risk_assessment else 'NO (0 model tokens consumed)'}")
    print(f"⚡ Completed At: {result_1.completed_at}")
    print(f"⚡ Workflow Paused: {result_1.is_paused}")

    print_banner("SCENARIO 2: 1000 INR or More - LLM Risk Review + HITL Pause & Resume")

    # High-value expense event arrives
    large_expense = {
        "amount": 5400.0,
        "submitter": "sneha.kulkarni@acme.corp",
        "category": "Cloud Infrastructure",
        "description": "Monthly reserved cloud compute cluster for AI evaluation benchmark",
        "date": "2026-09-23",
        "currency": "INR",
    }

    print("\n[Ambient Event Ingestion] Incoming Expense Event:")
    print_json(large_expense)

    # Step 1: Processing through ADK 2.0 Graph Workflow
    result_2 = await engine.process_expense_event(large_expense)

    print(f"\n⏸️ Workflow State: {result_2.status.value}")
    print(f"⏸️ Is Paused: {result_2.is_paused}")
    print(f"⏸️ Interrupt ID: {result_2.interrupt_id}")
    print(f"⏸️ Session ID: {result_2.session_id}")

    if result_2.risk_assessment:
        print("\n🔍 LLM Risk Judgment Summary:")
        print(f"   • Risk Level:        {result_2.risk_assessment.risk_level}")
        print(f"   • Risk Score:        {result_2.risk_assessment.risk_score}")
        print(f"   • Recommendation:    {result_2.risk_assessment.recommendation}")
        print(f"   • Policy Compliance: {result_2.risk_assessment.policy_compliance}")
        print(f"   • Analysis Rationale: {result_2.risk_assessment.analysis_summary}")
        if result_2.risk_assessment.flags:
            print(f"   • Flags: {', '.join(result_2.risk_assessment.flags)}")

    print(f"\n📬 ADK 2.0 RequestInput Notification Sent to Human Manager:")
    print("----------------------------------------------------------------------")
    print(result_2.prompt_message)
    print("----------------------------------------------------------------------")

    # Step 2: Human reviews the risk judgment and provides their decision
    print("\n[Human Interaction] Human Approver reviews and responds with 'APPROVE':")
    human_input = HumanDecision(
        action="APPROVE",
        reviewer_notes="Verified against Q3 Cloud Research budget allocation #ENG-402.",
        reviewer_id="director_rajiv",
    )
    print(f"   Decision: {human_input.action}")
    print(f"   Notes:    {human_input.reviewer_notes}")
    print(f"   Auditor:  {human_input.reviewer_id}")

    print("\n[Workflow Resumption] Resuming ADK 2.0 runner with human decision...")
    final_result_2 = await engine.resume_human_decision(
        session_id=result_2.session_id,
        invocation_id=result_2.invocation_id,
        interrupt_id=result_2.interrupt_id,
        decision=human_input,
    )

    print(f"\n✅ Final Workflow Status: {final_result_2.status.value}")
    print(f"✅ Final Reason:         {final_result_2.reason}")
    print(f"✅ Completed At:          {final_result_2.completed_at}")
    print(f"✅ Workflow Paused:       {final_result_2.is_paused}")

    print_banner("DEMONSTRATION COMPLETED SUCCESSFULLY")


if __name__ == "__main__":
    asyncio.run(run_demonstration())
