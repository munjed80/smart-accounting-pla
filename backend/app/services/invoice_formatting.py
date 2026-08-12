from datetime import date, datetime
from decimal import Decimal


def format_amount(cents: int) -> str:
    """
    Format cents as EUR currency string in Dutch format.

    Dutch format uses period (.) as thousand separator and comma (,) as decimal
    separator. Example: 1 234 567 cents → "€ 12.345,67"
    """
    euros = Decimal(cents) / 100
    formatted = f"{euros:,.2f}"
    dutch = formatted.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
    return f"\u20ac {dutch}"


def format_date_nl(date_obj: str | date | datetime) -> str:
    """Format date in Dutch format (dd-mm-yyyy)."""
    if isinstance(date_obj, str):
        date_obj = datetime.fromisoformat(date_obj.replace("Z", "+00:00")).date()
    return date_obj.strftime("%d-%m-%Y")


def format_quantity_nl(qty) -> str:
    """
    Format a quantity value in Dutch decimal notation.

    Whole numbers are shown without decimals; fractional values use a comma as
    the decimal separator, e.g. 28.75 → "28,75".
    """
    val = float(qty)
    if val == int(val):
        return str(int(val))
    return f"{val:.2f}".replace(".", ",")
