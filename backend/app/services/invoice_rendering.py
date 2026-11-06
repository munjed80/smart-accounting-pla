"""One rendering policy for invoice previews, downloads, public links and email."""
import logging
import re
from urllib.parse import quote
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.zzp import BusinessProfile
from app.services.invoice_view import invoice_view
from app.services.invoice_pdf import generate_invoice_pdf
from app.services.invoice_pdf_reportlab import generate_invoice_pdf_reportlab

logger = logging.getLogger(__name__)


async def load_company_logo(db: AsyncSession, administration_id: UUID) -> str | None:
    return await db.scalar(
        select(BusinessProfile.logo_data_url)
        .where(BusinessProfile.administration_id == administration_id)
    )


def render_invoice_pdf(invoice, logo_data_url: str | None = None):
    """HTML/Pango handles Unicode and long blocks; the safe Latin renderer is a fallback."""
    try:
        return generate_invoice_pdf(invoice, logo_data_url)
    except Exception:
        logger.warning('Primary invoice PDF renderer failed; trying fallback', exc_info=True)
        text = ' '.join(str(value) for value in vars(invoice_view(invoice)).values())
        text += ' '.join(line.description for line in invoice.lines)
        if any(ord(char) > 255 and char not in '€–—‘’“”•…' for char in text):
            raise RuntimeError('Unicode PDF rendering is not available')
        return generate_invoice_pdf_reportlab(invoice, logo_data_url)


def pdf_disposition(invoice, *, inline=False):
    """RFC 5987 filename plus a conservative ASCII fallback, with no header controls."""
    number = re.sub(r'[\x00-\x1f\x7f/\\]', '_', invoice.invoice_number)
    filename = f'{number}.pdf'
    fallback = re.sub(r'[^A-Za-z0-9._-]', '_', filename)
    return f'''{'inline' if inline else 'attachment'}; filename="{fallback}"; filename*=UTF-8''{quote(filename, safe='')}'''
