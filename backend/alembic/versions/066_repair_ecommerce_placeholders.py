"""Return legacy placeholder postings to review; no ledger entries existed for them."""
from alembic import op
revision = '066_ecommerce_posting'
down_revision = '065_prepaid_access_plans'
branch_labels = None
depends_on = None

def upgrade():
    op.execute("""UPDATE ecommerce_mappings SET review_status='needs_review',
        posted_entity_type=NULL, posted_entity_id=NULL, posted_by=NULL, posted_at=NULL,
        approved_by=NULL, approved_at=NULL,
        notes=COALESCE(notes, '') || '\nOude voorlopige boeking: controleer en boek opnieuw naar het grootboek.'
        WHERE posted_entity_type='pending_revenue'""")

def downgrade():
    # Never manufacture a posted state when no ledger entry exists.
    pass
