"""Shared, explicit half-up rounding at the monetary cent boundary."""

from decimal import Decimal, ROUND_HALF_UP


def round_cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def calculate_line_totals(quantity, unit_price_cents: int, vat_rate) -> tuple[int, int]:
    net = round_cents(Decimal(str(quantity)) * Decimal(unit_price_cents))
    vat = round_cents(Decimal(net) * Decimal(str(vat_rate)) / Decimal(100))
    return net, vat


def calculate_vat_amount(amount_cents: int, vat_rate) -> int:
    rate = Decimal(str(vat_rate))
    return round_cents(Decimal(amount_cents) * rate / (Decimal(100) + rate))
