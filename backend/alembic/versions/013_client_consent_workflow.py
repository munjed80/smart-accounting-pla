"""Client Consent Workflow

Adds consent management to accountant-client assignments:
- ZZP clients must approve accountant invitations
- Status tracking (PENDING, ACTIVE, REVOKED)
- Invitation source (ACCOUNTANT, ADMIN)
- Timestamps for consent lifecycle

Revision ID: 013_client_consent_workflow
Revises: 012_auth_tokens_email_verification
Create Date: 2024-01-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '013_client_consent_workflow'
down_revision: Union[str, None] = '012_auth_tokens_email_verification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create assignment_status enum
    op.execute("""
        CREATE TYPE assignmentstatus AS ENUM (
            'PENDING',
            'ACTIVE',
            'REVOKED'
        )
    """)
    
    # Create invited_by enum
    op.execute("""
        CREATE TYPE invitedby AS ENUM (
            'ACCOUNTANT',
            'ADMIN'
        )
    """)
    
    # Add client_user_id column (references the ZZP user)
    op.add_column(
        'accountant_client_assignments',
        sa.Column('client_user_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    
    # Add status column (defaults to ACTIVE for backward compatibility with existing records)
    op.add_column(
        'accountant_client_assignments',
        sa.Column(
            'status',
            postgresql.ENUM('PENDING', 'ACTIVE', 'REVOKED', name='assignmentstatus', create_type=False),
            nullable=False,
            server_default='ACTIVE'
        )
    )
    
    # Add invited_by column (defaults to ADMIN for backward compatibility)
    op.add_column(
        'accountant_client_assignments',
        sa.Column(
            'invited_by',
            postgresql.ENUM('ACCOUNTANT', 'ADMIN', name='invitedby', create_type=False),
            nullable=False,
            server_default='ADMIN'
        )
    )
    
    # Add approved_at timestamp
    op.add_column(
        'accountant_client_assignments',
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True)
    )
    
    # Add revoked_at timestamp
    op.add_column(
        'accountant_client_assignments',
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True)
    )
    
    # Add foreign key constraint for client_user_id
    op.create_foreign_key(
        'fk_accountant_client_assignments_client_user_id',
        'accountant_client_assignments',
        'users',
        ['client_user_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Create index for efficient querying by client_user_id
    op.create_index(
        'ix_accountant_client_assignments_client_user',
        'accountant_client_assignments',
        ['client_user_id']
    )
    
    # Create index for efficient querying by status
    op.create_index(
        'ix_accountant_client_assignments_status',
        'accountant_client_assignments',
        ['status']
    )
    
    # Backfill client_user_id for existing records
    # Find the owner of each administration and set as client_user_id
    op.execute("""
        UPDATE accountant_client_assignments aca
        SET client_user_id = am.user_id,
            approved_at = aca.assigned_at
        FROM administration_members am
        WHERE aca.administration_id = am.administration_id
          AND am.role = 'OWNER'
          AND aca.client_user_id IS NULL
    """)
    
    # Now make client_user_id NOT NULL
    op.alter_column(
        'accountant_client_assignments',
        'client_user_id',
        nullable=False
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_accountant_client_assignments_status', 'accountant_client_assignments')
    op.drop_index('ix_accountant_client_assignments_client_user', 'accountant_client_assignments')
    
    # Drop foreign key
    op.drop_constraint('fk_accountant_client_assignments_client_user_id', 'accountant_client_assignments', type_='foreignkey')
    
    # Drop columns
    op.drop_column('accountant_client_assignments', 'revoked_at')
    op.drop_column('accountant_client_assignments', 'approved_at')
    op.drop_column('accountant_client_assignments', 'invited_by')
    op.drop_column('accountant_client_assignments', 'status')
    op.drop_column('accountant_client_assignments', 'client_user_id')
    
    # Drop enums
    op.execute('DROP TYPE invitedby')
    op.execute('DROP TYPE assignmentstatus')
