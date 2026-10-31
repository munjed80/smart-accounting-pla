"""Refresh unposted review snapshots; changes always require a new approval."""
from sqlalchemy import select
from app.models.ecommerce import EcommerceMapping, EcommerceOrder, EcommerceRefund, MappingReviewStatus


async def refresh_reviews(db, connection):
    mappings = (await db.execute(select(EcommerceMapping).where(EcommerceMapping.connection_id == connection.id).with_for_update())).scalars().all()
    for mapping in mappings:
        if mapping.order_id:
            source = await db.get(EcommerceOrder, mapping.order_id)
            values = dict(revenue_cents=source.subtotal_cents, tax_cents=source.tax_cents,
                shipping_cents=source.shipping_cents, discount_cents=source.discount_cents,
                net_amount_cents=source.total_amount_cents, currency=source.currency)
        else:
            source = await db.get(EcommerceRefund, mapping.refund_id)
            values = dict(refund_cents=source.amount_cents, net_amount_cents=-source.amount_cents, currency=source.currency)
        if all(getattr(mapping, key) == value for key, value in values.items()):
            continue
        if mapping.posted_entity_id:
            warning = 'Bron gewijzigd na boeking; laat een correctie controleren door je boekhouder.'
            if warning not in (mapping.notes or ''):
                mapping.notes = ((mapping.notes or '') + '\n' + warning).strip()
            continue
        for key, value in values.items():
            setattr(mapping, key, value)
        mapping.review_status = MappingReviewStatus.NEEDS_REVIEW
        mapping.vat_status = 'unknown'
        mapping.vat_rate = None
        mapping.approved_at = mapping.approved_by = None
