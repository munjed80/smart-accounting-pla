import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text
from alembic import context

# Import models to ensure they're registered with the metadata
from app.core.database import Base
from app.models.user import User
from app.models.administration import Administration, AdministrationMember
from app.models.document import Document, ExtractedField
from app.models.transaction import Transaction, TransactionLine
from app.models.accounting import ChartOfAccount, VatCode
# Core ledger models
from app.models.ledger import AccountingPeriod, JournalEntry, JournalLine
from app.models.subledger import Party, OpenItem, OpenItemAllocation
from app.models.assets import FixedAsset, DepreciationSchedule
from app.models.issues import ClientIssue, ValidationRun

# this is the Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target metadata
target_metadata = Base.metadata

# Get database URL from environment
database_url = os.environ.get(
    "DATABASE_URL_SYNC",
    os.environ.get(
        "DATABASE_URL",
        "postgresql://accounting_user:change_me@localhost:5432/accounting_db"
    )
)
# Ensure we use sync driver for migrations
if database_url.startswith("postgresql+asyncpg"):
    database_url = database_url.replace("postgresql+asyncpg", "postgresql")

config.set_main_option("sqlalchemy.url", database_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        # Defensive step: Expand alembic_version.version_num to VARCHAR(128) if it exists.
        # This handles the case where alembic_version was created by a previous Alembic run
        # before we added the column expansion to 001_initial.py.
        # Our revision IDs are human-readable and longer than VARCHAR(32), e.g.,
        # "010_accountant_dashboard_bulk_ops", which would cause truncation errors.
        # Use a conditional check to avoid errors if table doesn't exist (first ever run).
        # Wrapped in try/except so a fresh DB without the table does not crash.
        try:
            connection.execute(text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'alembic_version' AND column_name = 'version_num'
                    ) THEN
                        ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(128);
                    END IF;
                END $$;
            """))
            connection.commit()
        except Exception:
            # Ignore errors - table may not exist yet on a fresh database
            pass

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
