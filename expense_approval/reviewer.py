"""LLM Risk Reviewer module for expense analysis."""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from .models import ExpenseReport, RiskAssessment

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert Corporate Financial Auditor and Risk Reviewer.
Your role is EXCLUSIVELY to perform qualitative risk analysis on an employee expense report that has been escalated for review.
You DO NOT decide the routing or threshold rules - you only provide objective risk judgment, identify policy concerns, and evaluate legitimacy.

Evaluate:
1. Category vs. description appropriateness (e.g. personal items disguised as office supplies).
2. Reasonableness of amount for the stated category and purpose.
3. Weekend/holiday or suspicious expense timing.
4. Completeness and clarity of description.
5. Overall risk level (LOW, MEDIUM, HIGH) and risk score (0.0 = completely safe, 1.0 = highly fraudulent or non-compliant).
"""


class LlmRiskReviewer:
    """Performs risk assessment on expenses exceeding the auto-approval threshold.

    Uses Google Gemini with structured output if an API key is available,
    or falls back to a deterministic heuristic auditor in offline/test environments.
    """

    def __init__(self, model_name: str = "gemini-2.5-flash", api_key: Optional[str] = None):
        self.model_name = model_name
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self._client = None
        if self.api_key:
            try:
                from google import genai
                self._client = genai.Client(api_key=self.api_key)
            except Exception as e:
                logger.warning("Could not initialize google-genai client: %s. Using heuristic reviewer.", e)

    async def assess_risk(self, expense: ExpenseReport) -> RiskAssessment:
        """Analyze an expense report and generate a structured RiskAssessment."""
        if self._client:
            try:
                return await self._call_gemini_model(expense)
            except Exception as e:
                logger.warning("Gemini API call failed (%s). Falling back to heuristic risk reviewer.", e)
                return self._heuristic_assessment(expense)
        else:
            return self._heuristic_assessment(expense)

    async def _call_gemini_model(self, expense: ExpenseReport) -> RiskAssessment:
        """Invokes Gemini with structured JSON output."""
        prompt = (
            f"Please review the following expense report submitted by {expense.submitter}:\n"
            f"- Amount: {expense.amount} {expense.currency}\n"
            f"- Category: {expense.category}\n"
            f"- Description: {expense.description}\n"
            f"- Date: {expense.date}\n\n"
            f"Provide your structured risk assessment according to the specified schema."
        )

        response = self._client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config={
                "system_instruction": SYSTEM_PROMPT,
                "response_mime_type": "application/json",
                "response_schema": RiskAssessment,
                "temperature": 0.1,
            },
        )

        # Parse structured output from Gemini
        if hasattr(response, "parsed") and isinstance(response.parsed, RiskAssessment):
            return response.parsed
        elif hasattr(response, "text") and response.text:
            data = json.loads(response.text)
            return RiskAssessment.model_validate(data)

        raise ValueError("Model response did not contain structured RiskAssessment data.")

    def _heuristic_assessment(self, expense: ExpenseReport) -> RiskAssessment:
        """Deterministic heuristic assessment used when running offline or in unit tests."""
        amount = expense.amount
        desc_lower = expense.description.lower()
        cat_lower = expense.category.lower()

        flags = []
        risk_score = 0.15
        risk_level = "LOW"
        policy_compliance = True
        recommendation = "APPROVE"

        # Check for common escalation indicators
        high_risk_keywords = ["gift", "liquor", "alcohol", "spa", "personal", "cash", "crypto", "gambling", "luxury"]
        medium_risk_keywords = ["electronics", "hardware", "device", "flight", "entertainment", "hotel"]

        matched_high = [kw for kw in high_risk_keywords if kw in desc_lower]
        matched_med = [kw for kw in medium_risk_keywords if kw in desc_lower or kw in cat_lower]

        if matched_high:
            flags.append(f"Expense description references restricted keyword(s): {', '.join(matched_high)}")
            risk_score += 0.55
            policy_compliance = False

        if matched_med:
            flags.append(f"Expense contains high-scrutiny category or item: {', '.join(matched_med)}")
            risk_score += 0.25

        if amount >= 10000.0:
            flags.append(f"High-value transaction: ₹{amount:,.2f} requires executive level visibility")
            risk_score += 0.30
        elif amount >= 3000.0:
            flags.append(f"Substantial transaction: ₹{amount:,.2f} exceeds standard team meal/supply budget")
            risk_score += 0.15

        if len(expense.description.strip()) < 15:
            flags.append("Vague description provided; verify itemized receipts")
            risk_score += 0.15

        # Normalize score
        risk_score = min(max(risk_score, 0.05), 0.98)

        if risk_score >= 0.70:
            risk_level = "HIGH"
            recommendation = "REJECT" if not policy_compliance else "NEEDS_VERIFICATION"
            summary = (
                f"High risk profile ({risk_score:.2f}). Identified critical flags ({len(flags)} items) "
                f"including potential policy non-compliance for {expense.category}. Detailed audit recommended."
            )
        elif risk_score >= 0.40:
            risk_level = "MEDIUM"
            recommendation = "NEEDS_VERIFICATION"
            summary = (
                f"Moderate risk profile ({risk_score:.2f}). Transaction amount (₹{amount:,.2f}) and context "
                f"require manager verification of itemized receipts."
            )
        else:
            risk_level = "LOW"
            recommendation = "APPROVE"
            summary = (
                f"Low risk profile ({risk_score:.2f}). Standard business expense for {expense.category}. "
                f"Description and amount appear consistent with company guidelines."
            )

        return RiskAssessment(
            risk_level=risk_level,
            risk_score=round(risk_score, 2),
            flags=flags,
            analysis_summary=summary,
            policy_compliance=policy_compliance,
            recommendation=recommendation,
        )
