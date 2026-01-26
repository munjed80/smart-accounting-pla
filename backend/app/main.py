from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import redis.asyncio as redis

from app.core.config import settings
from app.core.database import engine
from app.api.v1 import auth, administrations, documents, transactions, dashboard, accountant, decisions, periods, vat

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

app.include_router(api_v1_router)

# Token endpoint at root level for OAuth2 compatibility
app.include_router(auth.router, tags=["auth"])


@app.get("/health")
async def health_check():
    """Health check endpoint that verifies DB and Redis connectivity"""
    health = {"status": "healthy", "database": "unknown", "redis": "unknown"}
    
    # Check database
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        health["database"] = "connected"
    except Exception as e:
        health["database"] = f"error: {str(e)}"
        health["status"] = "unhealthy"
    
    # Check Redis
    try:
        client = redis.from_url(settings.REDIS_URL)
        await client.ping()
        await client.close()
        health["redis"] = "connected"
    except Exception as e:
        health["redis"] = f"error: {str(e)}"
        health["status"] = "unhealthy"
    
    return health


@app.get("/")
async def root():
    return {
        "message": "Smart Accounting Platform API",
        "version": "1.0.0",
        "docs": "/docs",
    }
