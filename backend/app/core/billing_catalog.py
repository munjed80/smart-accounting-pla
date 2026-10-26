"""Public plan catalog shared with the frontend; checkout amounts remain unchanged."""

import json
from decimal import Decimal
from pathlib import Path

_catalog = json.loads(Path(__file__).with_name("billing_plans.json").read_text())
PLAN_METADATA = {
    code: {"price": Decimal(plan["price_monthly"]), "description": plan["description"]}
    for code, plan in _catalog.items()
}
