import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import configure_mappers
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import engine
from app.api.v1 import auth, administrations, documents, transactions, dashboard, accountant, decisions, periods, vat, review_queue, observability, accountant_dashboard, work_queue, admin, zzp, bank, meta, zzp_customers, zzp_profile, zzp_invoices, zzp_expenses, zzp_time, zzp_calendar, zzp_work_sessions, zzp_bank, zzp_insights, zzp_quotes, zzp_dashboard, bookkeeping, client_data, zzp_payments, zzp_ledger, zzp_commitments, certificates, subscriptions, webhooks, contact_messages, zzp_documents

logger = logging.getLogger(__name__)


def verify_orm_mappings() -> None:
    """
    Verify all SQLAlchemy ORM mappings are valid at startup.
    
    This catches relationship configuration errors early before
    any requests are processed, preventing cryptic 500 errors.
    """
    # Import all models to ensure they are registered
    from app.models import (
        User, Administration, AdministrationMember,
        Document, ExtractedField, DocumentSuggestedAction, DocumentAuditLog,
        Transaction, TransactionLine,
        ChartOfAccount, VatCode, VatCategory,
        AccountingPeriod, JournalEntry, JournalLine, BookkeepingAuditLog,
        Party, OpenItem, OpenItemAllocation,
        FixedAsset, DepreciationSchedule,
        ClientIssue, ValidationRun,
        SuggestedAction, AccountantDecision, DecisionPattern,
        Alert,
        AccountantClientAssignment, BulkOperation, ClientReminder,
        AuthToken,
        BankAccount, BankTransaction, ReconciliationAction,
        ZZPCustomer, BusinessProfile,
        ZZPInvoice, ZZPInvoiceLine, ZZPInvoiceCounter,
        ZZPExpense, ZZPTimeEntry, ZZPCalendarEvent,
        WorkSession, ZZPBankTransactionMatch,
        ZZPPayment, ZZPPaymentAllocation,
        FinancialCommitment,
        Plan, Subscription, SubscriptionStatus, AdminAuditLog, WebhookEvent,
        AuditLog,
        Certificate,
        ContactMessage,
        ZZPDocument,
    )
    
    # This will raise InvalidRequestError if any relationships are misconfigured
    configure_mappers()
    logger.info("ORM mapper configuration verified successfully")


def log_enum_and_router_status() -> None:
    """
    Log DocumentStatus enum values and router mount status at startup.
    
    This helps diagnose enum mismatch and routing issues in production.
    """
    from app.models.document import DocumentStatus
    
    # Log DocumentStatus enum values
    status_values = [s.value for s in DocumentStatus]
    logger.info(f"DocumentStatus enum values: {status_values}")
    
    # Log bank routes that should be mounted under /api/v1
    bank_routes = [route.path for route in bank.router.routes]
    logger.info(
        "Router mount confirmed: /api/v1/accountant/bank (bank-reconciliation), routes=%s",
        bank_routes,
    )


def log_mollie_status() -> None:
    """
    Log Mollie integration status at startup (no secrets logged).

    Prints whether Mollie is enabled and which mode (TEST / LIVE) is active
    based on the API key prefix (test_xxx → TEST, live_xxx → LIVE).
    """
    if not settings.mollie_enabled:
        logger.info("Mollie integration: DISABLED (MOLLIE_API_KEY not set)")
        return

    api_key_prefix = (settings.MOLLIE_API_KEY or "")[:5]
    if api_key_prefix == "live_":
        mode = "LIVE"
    elif api_key_prefix == "test_":
        mode = "TEST"
    else:
        mode = "UNKNOWN"

    webhook_secret_configured = bool(settings.MOLLIE_WEBHOOK_SECRET)
    public_url = settings.APP_PUBLIC_URL or settings.APP_URL

    logger.info(
        "Mollie integration: ENABLED | mode=%s | webhook_secret_configured=%s | public_url=%s",
        mode,
        webhook_secret_configured,
        public_url,
    )

    if not webhook_secret_configured:
        logger.warning("Mollie: MOLLIE_WEBHOOK_SECRET is not set – webhooks will be rejected")

    if not settings.APP_PUBLIC_URL:
        logger.warning(
            "Mollie: APP_PUBLIC_URL is not set – falling back to APP_URL (%s) for webhook URLs",
            settings.APP_URL,
        )


async def verify_database_enums() -> None:
    """
    Verify that database enum values match the required Python enum values.
    
    This check runs at startup and fails fast if critical enum values are missing,
    providing a clear error message pointing to the required migration.
    
    Raises:
        RuntimeError: If required enum values are missing from the database.
    """
    from app.models.document import DocumentStatus
    
    required_status_values = {s.value for s in DocumentStatus}
    
    try:
        async with engine.begin() as conn:
            # Query existing enum values from pg_enum
            result = await conn.execute(text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = 'documentstatus'::regtype
            """))
            db_values = {row[0] for row in result.fetchall()}
            
            # Check for missing values
            missing = required_status_values - db_values
            if missing:
                logger.critical(
                    f"ENUM MISMATCH: Database 'documentstatus' is missing values: {sorted(missing)}. "
                    f"Required values: {sorted(required_status_values)}. "
                    f"Run migration 015_add_document_status_enum_values to fix this. "
                    f"Command: alembic upgrade head"
                )
                raise RuntimeError(
                    f"Database enum 'documentstatus' is missing required values: {sorted(missing)}. "
                    f"Please run: alembic upgrade head"
                )
            
            logger.info(f"Database enum 'documentstatus' verified: {sorted(db_values)}")
            
    except Exception as e:
        # If the enum doesn't exist at all, that's also an error
        if "does not exist" in str(e):
            logger.critical(
                "ENUM MISSING: Database type 'documentstatus' does not exist. "
                "Run migrations to create it: alembic upgrade head"
            )
            raise RuntimeError(
                "Database type 'documentstatus' does not exist. "
                "Please run: alembic upgrade head"
            ) from e
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan events.
    
    Startup:
    - Verify ORM mappings to fail fast if models are misconfigured
    - Verify database enum values match Python enums
    - Log enum values and router status for diagnostics
    - Register audit logging hooks
    
    Shutdown:
    - Cleanup resources if needed
    """
    # Startup
    logger.info("Application startup initiated")
    try:
        verify_orm_mappings()
    except Exception as e:
        logger.exception("ORM mapper configuration failed during startup")
        raise RuntimeError(f"Application cannot start: ORM mapping error - {e}") from e
    
    # Verify database enums match expected values
    try:
        await verify_database_enums()
    except RuntimeError as e:
        logger.exception("Database enum verification failed during startup")
        raise
    except Exception as e:
        # Non-critical: log warning but allow startup (DB might not be ready yet)
        logger.warning(f"Could not verify database enums (DB may not be ready): {e}")
    
    # Log enum and router status for production diagnostics
    log_enum_and_router_status()

    # Log Mollie integration status (safe – no secrets)
    log_mollie_status()

    # Register audit logging hooks
    from app.audit.session_hooks import register_audit_hooks
    from app.core.database import async_session_maker
    register_audit_hooks(async_session_maker)
    logger.info("Audit logging hooks registered")
    
    logger.info("Application startup completed successfully")

    yield
    
    # Shutdown (cleanup if needed)
    logger.info("Application shutdown complete")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware - must be added FIRST to ensure headers on all responses including errors
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Selected-Client-Id"],
    expose_headers=["Content-Disposition", "Content-Length"],  # Expose headers for mobile PDF download
)

# Audit middleware - added after CORS to capture request context
from app.audit.middleware import AuditMiddleware
app.add_middleware(AuditMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler to ensure JSON responses with proper CORS headers.
    
    CORSMiddleware will add CORS headers to this response, so browser
    will see a proper error rather than a misleading CORS error.
    
    Note: HTTPException is handled by FastAPI's default handler and will
    not reach this handler, preserving intended status codes.
    """
    # HTTPException is handled by FastAPI's default handler, not this one
    # This only catches truly unhandled exceptions
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
        },
    )

# API v1 router
api_v1_router = APIRouter(prefix="/api/v1")
api_v1_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(administrations.router, prefix="/administrations", tags=["administrations"])
api_v1_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_v1_router.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
api_v1_router.include_router(dashboard.router, prefix="/accountant", tags=["accountant-dashboard"])
api_v1_router.include_router(accountant.router, prefix="/accountant", tags=["accountant-api"])
api_v1_router.include_router(decisions.router, prefix="/accountant", tags=["decision-engine"])
api_v1_router.include_router(periods.router, prefix="/accountant", tags=["period-control"])
api_v1_router.include_router(vat.router, prefix="/accountant", tags=["vat-btw-filing"])
api_v1_router.include_router(certificates.router, prefix="/accountant", tags=["pki-certificates"])
api_v1_router.include_router(review_queue.router, prefix="/accountant", tags=["document-review-queue"])
api_v1_router.include_router(accountant_dashboard.router, prefix="/accountant", tags=["accountant-master-dashboard"])
api_v1_router.include_router(work_queue.router, prefix="/accountant", tags=["work-queue-reminders-evidence"])
api_v1_router.include_router(bank.router, prefix="/accountant", tags=["bank-reconciliation"])
api_v1_router.include_router(bookkeeping.router, prefix="/accountant", tags=["bookkeeping-ledger"])
api_v1_router.include_router(client_data.router, prefix="/accountant", tags=["client-data-access"])
api_v1_router.include_router(zzp.router, prefix="/zzp", tags=["zzp-client-consent"])
api_v1_router.include_router(zzp_customers.router, prefix="/zzp", tags=["zzp-customers"])
api_v1_router.include_router(zzp_profile.router, prefix="/zzp", tags=["zzp-business-profile"])
api_v1_router.include_router(zzp_invoices.router, prefix="/zzp", tags=["zzp-invoices"])
api_v1_router.include_router(zzp_expenses.router, prefix="/zzp", tags=["zzp-expenses"])
api_v1_router.include_router(zzp_time.router, prefix="/zzp", tags=["zzp-time-tracking"])
api_v1_router.include_router(zzp_calendar.router, prefix="/zzp", tags=["zzp-calendar"])
api_v1_router.include_router(zzp_work_sessions.router, prefix="/zzp", tags=["zzp-work-sessions"])
api_v1_router.include_router(zzp_bank.router, prefix="/zzp", tags=["zzp-bank-payments"])
api_v1_router.include_router(zzp_insights.router, prefix="/zzp", tags=["zzp-ai-insights"])
api_v1_router.include_router(zzp_quotes.router, prefix="/zzp", tags=["zzp-quotes"])
api_v1_router.include_router(zzp_dashboard.router, prefix="/zzp", tags=["zzp-dashboard"])
api_v1_router.include_router(zzp_payments.router, prefix="/zzp", tags=["zzp-payments"])
api_v1_router.include_router(zzp_ledger.router, prefix="/zzp", tags=["zzp-ledger"])
api_v1_router.include_router(zzp_commitments.router, prefix="/zzp", tags=["zzp-commitments"])
api_v1_router.include_router(zzp_documents.router, prefix="/zzp", tags=["zzp-documents"])
api_v1_router.include_router(subscriptions.router, prefix="", tags=["subscriptions"])
api_v1_router.include_router(webhooks.router, prefix="", tags=["webhooks"])
api_v1_router.include_router(observability.router, prefix="/ops", tags=["observability"])
api_v1_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_v1_router.include_router(contact_messages.router, prefix="", tags=["contact-messages"])
api_v1_router.include_router(meta.router, tags=["metadata"])

app.include_router(api_v1_router)

# Token endpoint at root level for OAuth2 compatibility
app.include_router(auth.router, tags=["auth"])


@app.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint.
    
    Verifies:
    - Database connectivity
    - Database migrations status (basic check)
    - Redis connectivity (if enabled)
    - Background tasks status (placeholder)
    
    Returns structured health status with HTTP 200 if core services are healthy.
    Redis is optional and won't cause health check to fail if disabled.
    """
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "database": {"status": "unknown", "message": None},
            "redis": {"status": "unknown", "message": None},
            "migrations": {"status": "unknown", "message": None},
            "background_tasks": {"status": "unknown", "message": None},
        }
    }
    
    all_healthy = True
    
    # Check database connectivity
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        health["components"]["database"]["status"] = "healthy"
        health["components"]["database"]["message"] = "Connected"
    except Exception as e:
        health["components"]["database"]["status"] = "unhealthy"
        health["components"]["database"]["message"] = str(e)
        all_healthy = False
    
    # Check migrations status (basic check - verify key tables exist)
    try:
        async with engine.begin() as conn:
            # Check for key tables from latest migration
            result = await conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'administrations', 'documents', 'journal_entries', 'alerts')
            """))
            table_count = result.scalar()
            if table_count >= 4:  # Allow for alerts table not existing yet
                health["components"]["migrations"]["status"] = "healthy"
                health["components"]["migrations"]["message"] = f"{table_count}/5 key tables present"
            else:
                health["components"]["migrations"]["status"] = "warning"
                health["components"]["migrations"]["message"] = f"Only {table_count}/5 key tables found"
    except Exception as e:
        health["components"]["migrations"]["status"] = "unhealthy"
        health["components"]["migrations"]["message"] = str(e)
        all_healthy = False
    
    # Check Redis connectivity (only if enabled)
    if settings.redis_enabled:
        try:
            import redis.asyncio as redis
            client = redis.from_url(settings.REDIS_URL)
            await client.ping()
            await client.close()
            health["components"]["redis"]["status"] = "healthy"
            health["components"]["redis"]["message"] = "Connected"
        except Exception as e:
            health["components"]["redis"]["status"] = "unhealthy"
            health["components"]["redis"]["message"] = str(e)
            # Redis is not critical for core functionality - don't fail health check
    else:
        health["components"]["redis"]["status"] = "disabled"
        health["components"]["redis"]["message"] = "Redis not configured (REDIS_URL not set)"
    
    # Background tasks status (placeholder - would check actual task queue in production)
    health["components"]["background_tasks"]["status"] = "healthy"
    health["components"]["background_tasks"]["message"] = "No background task queue configured"
    
    # Set overall status
    if not all_healthy:
        health["status"] = "unhealthy"
    
    return health


@app.get("/")
async def root():
    return {
        "message": "Smart Accounting Platform API",
        "version": "1.0.0",
        "docs": "/docs",
    }
