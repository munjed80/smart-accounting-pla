from html import escape
from types import SimpleNamespace
from app.models.zzp import ZZPInvoice, ZZPInvoiceLine


def invoice_view(invoice, *, escape_text=False):
    """Copy scalar fields without changing an ORM instance or interpreting text as HTML."""
    def copy_fields(obj, model):
        result = {}
        for column in model.__table__.columns:
            value = getattr(obj, column.name, None)
            if escape_text and isinstance(value, str):
                value = escape(value, quote=True)
                if column.name in ('notes', 'description'):
                    value = value.replace('\r\n', '\n').replace('\n', '<br/>')
            result[column.name] = value
        return SimpleNamespace(**result)
    result = copy_fields(invoice, ZZPInvoice)
    references = getattr(result, 'credit_references', None)
    if references and result.status != 'credit_note':
        suffix = f'Bijbehorende creditnota’s: {references}'
        result.notes = ((result.notes + ('<br/>' if escape_text else '\n')) if result.notes else '') + suffix
    result.lines = [copy_fields(line, ZZPInvoiceLine) for line in invoice.lines]
    return result
