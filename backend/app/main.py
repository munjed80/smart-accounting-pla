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
from app.api.v1 import auth, administrations, documents, transactions, dashboard, accountant, decisions, periods, vat, review_queue, observability, accountant_dashboard, work_queue, admin, zzp, bank, meta, zzp_customers

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
        AccountingPeriod, JournalEntry, JournalLine,
        Party, OpenItem, OpenItemAllocation,
        FixedAsset, DepreciationSchedule,
        ClientIssue, ValidationRun,
        SuggestedAction, AccountantDecision, DecisionPattern,
        Alert,
        AccountantClientAssignment, BulkOperation, ClientReminder,
        AuthToken,
        BankAccount, BankTransaction, ReconciliationAction,
        ZZPCustomer,
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
    
    Shutdown:
    - Cleanup resources if needed
    """
    # Startup
    try:
        verify_orm_mappings()
    except Exception as e:
        logger.critical(f"ORM mapper configuration failed: {e}")
        raise RuntimeError(f"Application cannot start: ORM mapping error - {e}") from e
    
    # Verify database enums match expected values
    try:
        await verify_database_enums()
    except RuntimeError as e:
        logger.critical(f"Database enum verification failed: {e}")
        raise
    except Exception as e:
        # Non-critical: log warning but allow startup (DB might not be ready yet)
        logger.warning(f"Could not verify database enums (DB may not be ready): {e}")
    
    # Log enum and router status for production diagnostics
    log_enum_and_router_status()
    
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
    allow_methods=["*"],
    allow_headers=["*"],
)


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
api_v1_router.include_router(review_queue.router, prefix="/accountant", tags=["document-review-queue"])
api_v1_router.include_router(accountant_dashboard.router, prefix="/accountant", tags=["accountant-master-dashboard"])
api_v1_router.include_router(work_queue.router, prefix="/accountant", tags=["work-queue-reminders-evidence"])
api_v1_router.include_router(bank.router, prefix="/accountant", tags=["bank-reconciliation"])
api_v1_router.include_router(zzp.router, prefix="/zzp", tags=["zzp-client-consent"])
api_v1_router.include_router(zzp_customers.router, prefix="/zzp", tags=["zzp-customers"])
api_v1_router.include_router(observability.router, prefix="/ops", tags=["observability"])
api_v1_router.include_router(admin.router, prefix="/admin", tags=["admin"])
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
