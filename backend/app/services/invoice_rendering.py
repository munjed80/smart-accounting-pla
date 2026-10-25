"""One rendering policy for invoice previews, downloads, public links and email."""
import logging
import re
from urllib.parse import quote

from app.services.invoice_view import invoice_view
from app.services.invoice_pdf import generate_invoice_pdf
from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab

logger = logging.getLogger(__name__)


def render_invoice_pdf(invoice):
    """HTML/Pango handles Unicode and long blocks; the safe Latin renderer is a fallback."""
    try:
        return generate_invoice_pdf(invoice)
    except Exception:
        logger.warning('Primary invoice PDF renderer failed; trying fallback', exc_info=True)
        text = ' '.join(str(value) for value in vars(invoice_view(invoice)).values())
        text += ' '.join(line.description for line in invoice.lines)
        if any(ord(char) > 255 and char not in '€–—‘’“”•…' for char in text):
            raise RuntimeError('Unicode PDF rendering is not available')
        return generate_invoice_pdf_reportlab(invoice)


def pdf_disposition(invoice, *, inline=False):
    """RFC 5987 filename plus a conservative ASCII fallback, with no header controls."""
    number = re.sub(r'[\x00-\x1f\x7f/\\]', '_', invoice.invoice_number)
    filename = f'{number}.pdf'
    fallback = re.sub(r'[^A-Za-z0-9._-]', '_', filename)
    return f'''{'inline' if inline else 'attachment'}; filename="{fallback}"; filename*=UTF-8''{quote(filename, safe='')}'''
