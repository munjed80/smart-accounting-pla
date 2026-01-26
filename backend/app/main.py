from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import engine
from app.api.v1 import auth, administrations, documents, transactions, dashboard, accountant, decisions, periods, vat, review_queue, observability, accountant_dashboard, work_queue

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
api_v1_router.include_router(observability.router, prefix="/ops", tags=["observability"])

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
