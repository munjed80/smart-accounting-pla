"""Shared public prepaid catalog with legacy recurring plans retained for existing customers."""

import json
from decimal import Decimal
from pathlib import Path

_catalog = json.loads(Path(__file__).with_name("billing_plans.json").read_text())
PLAN_METADATA = {
    code: {"price": Decimal(plan.get("amount", plan["price_monthly"])), "description": plan["description"], "months": plan.get("months"), "prepaid": plan.get("prepaid", False)}
    for code, plan in _catalog.items()
}

PREPAID_PLAN_CODES = frozenset(code for code, plan in PLAN_METADATA.items() if plan["prepaid"])
