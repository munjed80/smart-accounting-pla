"""
Helpers for translating VAT-code/box-code combinations into human-readable
explanations (used for VAT report line lineage / box mapping reasons).

Extracted from `app.api.v1.vat` as part of the routes-file decomposition.
Behavior is unchanged.
"""
from app.models.accounting import VatCode


def generate_mapping_reason(
    vat_code: VatCode,
    box_code: str,
    net_amount: float,
    vat_amount: float,
) -> str:
    """
    Generate a human-readable explanation for why a transaction maps to a specific VAT box.

    Uses VAT code category and box_mapping metadata to provide accurate, maintainable
    explanations without relying on code name parsing.

    Args:
        vat_code: The VAT code used for the transaction
        box_code: The target box code (e.g., "1a", "3b", "5b")
        net_amount: Net transaction amount
        vat_amount: VAT amount

    Returns:
        A short explanation string (e.g., "Binnenlandse omzet 21% → rubriek 1a")
    """
    rate = float(vat_code.rate)
    category = vat_code.category.value if hasattr(vat_code.category, 'value') else str(vat_code.category)

    # Domestic turnover boxes (1a-1e) - based on rate and category
    if box_code in ["1a", "1b", "1c"]:
        if category == "SALES":
            return f"Binnenlandse omzet {rate}% → rubriek {box_code}"
        return f"Omzet ander tarief ({rate}%) → rubriek {box_code}"

    if box_code == "1d":
        return f"Privégebruik → rubriek 1d"

    if box_code == "1e":
        return f"Omzet 0% of niet belast → rubriek 1e"

    # Domestic reverse charge (2a)
    if box_code == "2a":
        return f"Binnenlandse verlegging → rubriek 2a"

    # Export/EU turnover boxes (3a-3b)
    if box_code == "3a":
        return f"Levering buiten EU → rubriek 3a"

    if box_code == "3b":
        return f"ICP levering binnen EU → rubriek 3b"

    # Reverse charge boxes (4a-4b) - use category to distinguish
    if box_code == "4a":
        # Check if this is in the vat_box (output VAT) or turnover
        if category == "REVERSE_CHARGE":
            return f"Verlegde BTW diensten buiten EU → rubriek 4a"
        return f"Verlegde BTW - invoer/diensten buiten EU → rubriek 4a"

    if box_code == "4b":
        if category == "INTRA_EU":
            return f"EU-verwerving → rubriek 4b"
        return f"Verlegde BTW EU-verwerving → rubriek 4b"

    # Calculation boxes (5a, 5c, 5g)
    if box_code == "5a":
        return f"Verschuldigde BTW (berekend) → rubriek 5a"

    if box_code == "5c":
        return f"Subtotaal (5a - 5b) → rubriek 5c"

    if box_code == "5g":
        return f"Te betalen/ontvangen → rubriek 5g"

    # Input VAT / deductible box (5b) - use category to explain context
    if box_code == "5b":
        if category == "PURCHASES":
            return f"Voorbelasting {rate}% → rubriek 5b"
        elif category == "REVERSE_CHARGE":
            return f"Aftrekbare BTW verlegging → rubriek 5b"
        elif category == "INTRA_EU":
            return f"Aftrekbare BTW EU-verwerving → rubriek 5b"
        return f"Voorbelasting → rubriek 5b"

    # Fallback for any other boxes
    return f"BTW-code {vat_code.code} ({rate}%) → rubriek {box_code}"


__all__ = ["generate_mapping_reason"]
