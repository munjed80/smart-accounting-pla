import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Database, 
  Cpu, 
  Cloud, 
  HardDrives, 
  Code, 
  GitBranch,
  Copy,
  CheckCircle,
  Terminal,
  ShareNetwork,
  FileCode,
  Brain,
  Lightning,
  Eye,
  Target
} from '@phosphor-icons/react'
import { toast } from 'sonner'

function App() {
  const [copiedSection, setCopiedSection] = useState<string | null>(null)

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedSection(label)
    toast.success(`${label} copied to clipboard!`)
    setTimeout(() => setCopiedSection(null), 2000)
  }

  const dockerCompose = `version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: accounting-postgres
    environment:
      POSTGRES_DB: accounting_db
      POSTGRES_USER: accounting_user
      POSTGRES_PASSWORD: \${DB_PASSWORD:-change_me}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d:ro
    ports:
      - "5432:5432"
    networks:
      - accounting-backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U accounting_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: accounting-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - accounting-backend

  minio:
    image: minio/minio:latest
    container_name: accounting-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    networks:
      - accounting-backend

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: accounting-api
    environment:
      - DATABASE_URL=postgresql://accounting_user:\${DB_PASSWORD}@db:5432/accounting_db
      - REDIS_URL=redis://redis:6379/0
      - SPARK_MASTER_URL=spark://spark-master:7077
    volumes:
      - ./backend:/app
      - ./uploads:/app/uploads
    ports:
      - "8000:8000"
    depends_on:
      - db
      - redis
      - minio
    networks:
      - accounting-backend
      - accounting-frontend

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: accounting-celery-worker
    environment:
      - DATABASE_URL=postgresql://accounting_user:\${DB_PASSWORD}@db:5432/accounting_db
      - CELERY_BROKER_URL=redis://redis:6379/1
    volumes:
      - ./backend:/app
    depends_on:
      - redis
      - spark-master
    networks:
      - accounting-backend
    command: celery -A app.tasks worker --loglevel=info

  spark-master:
    image: bitnami/spark:3.5
    container_name: accounting-spark-master
    environment:
      - SPARK_MODE=master
      - SPARK_RPC_AUTHENTICATION_ENABLED=no
    volumes:
      - ./spark-worker/jobs:/opt/spark-apps
      - ./uploads:/opt/spark-data
    ports:
      - "7077:7077"
      - "8080:8080"
    networks:
      - accounting-backend

  spark-worker-1:
    image: bitnami/spark:3.5
    container_name: accounting-spark-worker-1
    environment:
      - SPARK_MODE=worker
      - SPARK_MASTER_URL=spark://spark-master:7077
      - SPARK_WORKER_MEMORY=2G
      - SPARK_WORKER_CORES=2
    volumes:
      - ./spark-worker/jobs:/opt/spark-apps
      - ./uploads:/opt/spark-data
    depends_on:
      - spark-master
    networks:
      - accounting-backend

  spark-worker-2:
    image: bitnami/spark:3.5
    container_name: accounting-spark-worker-2
    environment:
      - SPARK_MODE=worker
      - SPARK_MASTER_URL=spark://spark-master:7077
      - SPARK_WORKER_MEMORY=2G
      - SPARK_WORKER_CORES=2
    volumes:
      - ./spark-worker/jobs:/opt/spark-apps
      - ./uploads:/opt/spark-data
    depends_on:
      - spark-master
    networks:
      - accounting-backend

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: accounting-frontend
    environment:
      - VITE_API_URL=http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    depends_on:
      - api
    networks:
      - accounting-frontend

networks:
  accounting-backend:
    driver: bridge
  accounting-frontend:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  minio_data:`

  const setupCommands = `# Create project structure
mkdir -p smart-accounting-platform/{frontend,backend,spark-worker,database/init,nginx}
cd smart-accounting-platform

# Create backend structure
mkdir -p backend/app/{api/v1,models,schemas}
touch backend/app/__init__.py
touch backend/app/api/__init__.py
touch backend/app/api/v1/__init__.py

# Create docker-compose.yml
# (paste the docker-compose configuration)

# Create .env file
cat > .env << EOF
DB_PASSWORD=your_secure_password_here
REDIS_PASSWORD=your_redis_password
SECRET_KEY=your_jwt_secret_key_32_chars_min
DATABASE_URL=postgresql://accounting_user:\${DB_PASSWORD}@db:5432/accounting_db
EOF

# Copy all backend Python files (models.py, main.py, database.py, config.py, auth.py)
# Then create requirements.txt

# Build and start services
docker-compose build
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f api

# Run database migrations (if using Alembic)
docker-compose exec api alembic upgrade head

# Access services:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000/docs
# - Spark UI: http://localhost:8080
# - MinIO Console: http://localhost:9001`

  const backendDockerfile = `FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \\
    gcc postgresql-client \\
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`

  const frontendDockerfile = `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]`

  const requirements = `fastapi==0.110.0
uvicorn[standard]==0.27.1
sqlalchemy==2.0.27
alembic==1.13.1
psycopg2-binary==2.9.9
asyncpg==0.29.0
pydantic==2.6.1
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
celery==5.3.6
redis==5.0.1
boto3==1.34.34
pytesseract==0.3.10
Pillow==10.2.0
pandas==2.2.0`

  const modelsCode = `# backend/app/models.py
"""
Professional Accounting Database Models
Supports multi-tenant administration like SnelStart
"""
from sqlalchemy import Column, String, Integer, Numeric, Date, DateTime, Boolean, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from .database import Base


class UserRole(str, enum.Enum):
    ACCOUNTANT = "accountant"
    ZZP = "zzp"
    ADMIN = "admin"


class DocumentType(str, enum.Enum):
    INVOICE_PURCHASE = "invoice_purchase"
    INVOICE_SALES = "invoice_sales"
    RECEIPT = "receipt"
    BANK_STATEMENT = "bank_statement"
    CONTRACT = "contract"


class TransactionStatus(str, enum.Enum):
    DRAFT = "draft"
    POSTED = "posted"
    RECONCILED = "reconciled"
    VOID = "void"


class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.ZZP, nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    administrations = relationship("Administration", back_populates="owner")


class Administration(Base):
    """
    Multi-tenant support: Each user can manage multiple companies/administrations
    Like SnelStart's 'Administratie' concept
    """
    __tablename__ = "administrations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    company_name = Column(String(255), nullable=False)
    kvk_number = Column(String(8), nullable=True)
    btw_number = Column(String(14), nullable=True)
    
    address = Column(String(255))
    postal_code = Column(String(10))
    city = Column(String(100))
    country = Column(String(2), default="NL")
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    owner = relationship("User", back_populates="administrations")
    fiscal_years = relationship("FiscalYear", back_populates="administration", cascade="all, delete-orphan")
    ledger_accounts = relationship("GeneralLedger", back_populates="administration", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="administration", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="administration", cascade="all, delete-orphan")


class FiscalYear(Base):
    """
    Defines the accounting period for tax reporting
    Dutch: Boekjaar
    """
    __tablename__ = "fiscal_years"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    administration_id = Column(UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False)
    
    year_name = Column(String(50), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_closed = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    administration = relationship("Administration", back_populates="fiscal_years")


class GeneralLedger(Base):
    """
    Chart of Accounts (Grootboek)
    Standard Dutch RGS Codes: 1000-9999
    """
    __tablename__ = "general_ledger"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    administration_id = Column(UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False)
    
    account_code = Column(String(10), nullable=False)
    account_name = Column(String(255), nullable=False)
    account_type = Column(String(50), nullable=False)
    parent_code = Column(String(10), nullable=True)
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    administration = relationship("Administration", back_populates="ledger_accounts")
    transaction_lines = relationship("TransactionLine", back_populates="ledger_account")


class Transaction(Base):
    """
    Journal Entry (Boeking/Journaalpost)
    Groups debit/credit lines that must balance
    """
    __tablename__ = "transactions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    administration_id = Column(UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False)
    
    booking_number = Column(String(50), nullable=False)
    transaction_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    
    status = Column(Enum(TransactionStatus), default=TransactionStatus.DRAFT, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True)
    posted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    administration = relationship("Administration", back_populates="transactions")
    lines = relationship("TransactionLine", back_populates="transaction", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="transaction")


class TransactionLine(Base):
    """
    Individual Debit/Credit Line (Boekingsregel)
    """
    __tablename__ = "transaction_lines"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    ledger_account_id = Column(UUID(as_uuid=True), ForeignKey("general_ledger.id"), nullable=False)
    
    description = Column(String(500))
    debit = Column(Numeric(15, 2), default=0.00)
    credit = Column(Numeric(15, 2), default=0.00)
    
    vat_code = Column(String(10), nullable=True)
    vat_percentage = Column(Numeric(5, 2), nullable=True)
    vat_amount = Column(Numeric(15, 2), default=0.00)
    
    cost_center = Column(String(50), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    transaction = relationship("Transaction", back_populates="lines")
    ledger_account = relationship("GeneralLedger", back_populates="transaction_lines")


class Document(Base):
    """
    Uploaded Invoice/Receipt files linked to transactions
    """
    __tablename__ = "documents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    administration_id = Column(UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False)
    transaction_id = Column(UUID(as_uuid=True), ForeignKey("transactions.id"), nullable=True)
    
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(100))
    
    document_type = Column(Enum(DocumentType), nullable=False)
    
    ocr_status = Column(String(50), default="pending")
    ocr_data = Column(Text, nullable=True)
    ocr_processed_at = Column(DateTime(timezone=True), nullable=True)
    
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    administration = relationship("Administration", back_populates="documents")
    transaction = relationship("Transaction", back_populates="documents")
`

  const databaseCode = `# backend/app/database.py
"""
Async PostgreSQL Database Configuration
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from .config import settings

DATABASE_URL = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(
    DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()


async def get_db():
    """Dependency for FastAPI routes"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
`

  const configCode = `# backend/app/config.py
"""
Configuration Management with Pydantic
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Accounting Platform"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    
    DEBUG: bool = False
    
    DATABASE_URL: str
    REDIS_URL: str = "redis://redis:6379/0"
    
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    
    SPARK_MASTER_URL: str = "spark://spark-master:7077"
    
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET: str = "accounting-documents"
    
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
`

  const authCode = `# backend/app/auth.py
"""
JWT Authentication & Password Hashing
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .config import settings
from .database import get_db
from .models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
`

  const mainCode = `# backend/app/main.py
"""
FastAPI Application Entry Point
"""
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from .config import settings
from .database import init_db
from .api.v1 import auth, administrations, transactions, documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/Shutdown Events"""
    await init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "Smart Accounting Platform API",
        "version": settings.VERSION,
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


app.include_router(auth.router, prefix=settings.API_V1_PREFIX, tags=["Authentication"])
app.include_router(administrations.router, prefix=settings.API_V1_PREFIX, tags=["Administrations"])
app.include_router(transactions.router, prefix=settings.API_V1_PREFIX, tags=["Transactions"])
app.include_router(documents.router, prefix=settings.API_V1_PREFIX, tags=["Documents"])
`

  const authRouterCode = `# backend/app/api/v1/auth.py
"""
Authentication Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from ...database import get_db
from ...models import User, UserRole
from ...auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_active_user
)

router = APIRouter(prefix="/auth")


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.ZZP


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


@router.post("/register", response_model=UserResponse)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    new_user = User(
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        role=user_data.role
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    return current_user
`

  const dbInit = `-- database/init/01_extensions.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- database/init/02_schemas.sql
CREATE SCHEMA IF NOT EXISTS accounting;
SET search_path TO accounting, public;

-- Note: SQLAlchemy will create the tables via models.py
-- This is just for reference/manual setup if needed
`

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-background" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <HardDrives size={48} weight="duotone" className="text-primary" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Smart Accounting Platform
            </h1>
          </div>
          <p className="text-xl text-muted-foreground font-medium">
            Production-Ready Apache Spark + FastAPI + Multi-Tenant Architecture
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Badge variant="outline" className="gap-1">
              <Database size={16} />
              PostgreSQL
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Cpu size={16} />
              Apache Spark
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Code size={16} />
              FastAPI
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Cloud size={16} />
              MinIO S3
            </Badge>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-card/50 backdrop-blur-sm">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <GitBranch size={20} />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="spark" className="gap-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground">
              <Cpu size={20} />
              <span className="hidden sm:inline">Spark AI</span>
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database size={20} />
              <span className="hidden sm:inline">Models</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Code size={20} />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
            <TabsTrigger value="docker" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShareNetwork size={20} />
              <span className="hidden sm:inline">Docker</span>
            </TabsTrigger>
            <TabsTrigger value="backend" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <HardDrives size={20} />
              <span className="hidden sm:inline">Files</span>
            </TabsTrigger>
            <TabsTrigger value="database" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database size={20} />
              <span className="hidden sm:inline">DB Init</span>
            </TabsTrigger>
            <TabsTrigger value="setup" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Terminal size={20} />
              <span className="hidden sm:inline">Setup</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch size={24} className="text-primary" />
                  Architecture Overview
                </CardTitle>
                <CardDescription>Complete microservices architecture for enterprise accounting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Card className="bg-secondary/50 border-accent/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Database size={20} className="text-accent" />
                        Data Layer
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">PostgreSQL 16</Badge>
                        <span className="text-muted-foreground">Main DB</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Redis 7</Badge>
                        <span className="text-muted-foreground">Cache/Queue</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">MinIO</Badge>
                        <span className="text-muted-foreground">S3 Storage</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-secondary/50 border-accent/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <HardDrives size={20} className="text-accent" />
                        API Layer
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">FastAPI</Badge>
                        <span className="text-muted-foreground">REST API</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Celery</Badge>
                        <span className="text-muted-foreground">Async Tasks</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">SQLAlchemy</Badge>
                        <span className="text-muted-foreground">ORM</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-secondary/50 border-accent/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Cpu size={20} className="text-accent" />
                        Processing Layer
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Spark 3.5</Badge>
                        <span className="text-muted-foreground">OCR Engine</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">2 Workers</Badge>
                        <span className="text-muted-foreground">Scalable</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Tesseract</Badge>
                        <span className="text-muted-foreground">OCR Library</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-muted/50 rounded-lg p-6 font-mono text-xs overflow-x-auto">
                  <pre className="text-muted-foreground">
{`┌─────────────────────────────────────────────────────────────┐
│                    NGINX (Production SSL)                    │
└────────────────────┬──────────────────┬─────────────────────┘
                     │                  │
          ┌──────────▼────────┐  ┌──────▼────────┐
          │ Frontend (React)  │  │ Backend API   │
          │   Vite + TS       │  │   FastAPI     │
          │   Port 5173       │  │  Port 8000    │
          └───────────────────┘  └───┬───────────┘
                                     │
          ┌──────────────────────────┼───────────────┐
          │                          │               │
   ┌──────▼──────┐  ┌────────▼──────┐  ┌─────▼─────┐
   │ PostgreSQL  │  │     Redis     │  │   MinIO   │
   │  Port 5432  │  │   Port 6379   │  │ Port 9000 │
   └─────────────┘  └───────┬───────┘  └───────────┘
                            │
                   ┌────────▼────────┐
                   │ Celery Worker   │
                   └────────┬────────┘
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
   ┌──────▼──────┐  ┌───────▼──────┐  ┌──────▼──────┐
   │Spark Master │  │Spark Worker 1│  │Spark Worker2│
   │ Port 7077   │  │ OCR Process  │  │ OCR Process │
   └─────────────┘  └──────────────┘  └─────────────┘`}
                  </pre>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ShareNetwork size={18} className="text-primary" />
                      Network Topology
                    </h3>
                    <div className="bg-secondary/30 rounded-lg p-4 space-y-2 text-sm">
                      <div>
                        <Badge className="mb-2">accounting-backend</Badge>
                        <p className="text-muted-foreground">DB, Redis, MinIO, API, Spark cluster</p>
                      </div>
                      <div>
                        <Badge className="mb-2">accounting-frontend</Badge>
                        <p className="text-muted-foreground">Frontend, API, NGINX</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Cloud size={18} className="text-primary" />
                      Service Ports
                    </h3>
                    <div className="bg-secondary/30 rounded-lg p-4 space-y-1 text-sm font-mono">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Frontend:</span>
                        <span className="text-accent">5173</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">API:</span>
                        <span className="text-accent">8000</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PostgreSQL:</span>
                        <span className="text-accent">5432</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Redis:</span>
                        <span className="text-accent">6379</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Spark UI:</span>
                        <span className="text-accent">8080</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">MinIO Console:</span>
                        <span className="text-accent">9001</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spark" className="space-y-6">
            <Card className="bg-gradient-to-r from-accent/30 to-primary/30 border-2 border-accent/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Brain size={32} weight="duotone" className="text-accent" />
                  Intelligent Invoice Processor - Spark OCR + AI
                </CardTitle>
                <CardDescription className="text-base">
                  Production-grade Apache Spark job with OCR, AI-powered ledger account prediction, and automatic draft transaction creation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-accent/10 border-accent/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Eye size={24} className="text-accent" />
                        OCR Engine
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Tesseract Dutch + English</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Extract Date, Amount, VAT</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Merchant Identification</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-accent/10 border-accent/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Brain size={24} className="text-accent" />
                        AI Prediction
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>12+ Ledger Categories</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Keyword-Based Rules</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Confidence Scoring</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-accent/10 border-accent/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Lightning size={24} className="text-accent" />
                        Auto-Booking
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Draft Transaction Creation</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Double-Entry Bookkeeping</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-accent" />
                        <span>Ready for Approval</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Target size={20} className="text-primary" />
                    AI Ledger Account Prediction Examples
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="bg-background/50 rounded p-3">
                      <div className="font-semibold text-accent">Shell → 4310 Brandstof</div>
                      <div className="text-muted-foreground text-xs">Keywords: shell, bp, fuel, benzine</div>
                    </div>
                    <div className="bg-background/50 rounded p-3">
                      <div className="font-semibold text-accent">Microsoft → 4500 IT Costs</div>
                      <div className="text-muted-foreground text-xs">Keywords: microsoft, aws, hosting, software</div>
                    </div>
                    <div className="bg-background/50 rounded p-3">
                      <div className="font-semibold text-accent">Google Ads → 4600 Marketing</div>
                      <div className="text-muted-foreground text-xs">Keywords: google ads, facebook, linkedin</div>
                    </div>
                    <div className="bg-background/50 rounded p-3">
                      <div className="font-semibold text-accent">KPN → 5010 Telecom</div>
                      <div className="text-muted-foreground text-xs">Keywords: kpn, vodafone, internet</div>
                    </div>
                    <div className="bg-background/50 rounded p-3">
                      <div className="font-semibold text-accent">Restaurant → 4710 Entertainment</div>
                      <div className="text-muted-foreground text-xs">Keywords: restaurant, cafe, horeca</div>
                    </div>
                    <div className="bg-background/50 rounded p-3">
                      <div className="font-semibold text-accent">Albert Heijn → 1450 Private</div>
                      <div className="text-muted-foreground text-xs">Keywords: ah, jumbo, supermarkt</div>
                    </div>
                  </div>
                </div>

                <div className="bg-secondary/30 rounded-lg p-6">
                  <h3 className="font-semibold text-lg mb-4">Processing Workflow</h3>
                  <div className="space-y-3 font-mono text-xs">
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">1</Badge>
                      <div className="flex-1">
                        <div className="font-semibold">Invoice Upload</div>
                        <div className="text-muted-foreground">API saves to /uploads folder or pushes to Redis queue</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">2</Badge>
                      <div className="flex-1">
                        <div className="font-semibold">Spark Processor Detects</div>
                        <div className="text-muted-foreground">Watches folder or pulls from queue (configurable mode)</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">3</Badge>
                      <div className="flex-1">
                        <div className="font-semibold">OCR Extraction</div>
                        <div className="text-muted-foreground">Tesseract extracts: Date, Merchant, Total, VAT, Text</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">4</Badge>
                      <div className="flex-1">
                        <div className="font-semibold">AI Prediction</div>
                        <div className="text-muted-foreground">Keyword matching → Ledger Account Code + Confidence Score</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">5</Badge>
                      <div className="flex-1">
                        <div className="font-semibold">Draft Transaction Creation</div>
                        <div className="text-muted-foreground">DEBIT Expense | CREDIT Accounts Payable | Status: DRAFT</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Badge variant="secondary" className="mt-0.5">6</Badge>
                      <div className="flex-1">
                        <div className="font-semibold">Accountant Review</div>
                        <div className="text-muted-foreground">Frontend shows draft with confidence → Approve or Edit</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-primary/5 border-primary/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Example Transaction Output</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-xs space-y-2">
                      <div className="text-muted-foreground">Booking: DRAFT-1705315847</div>
                      <div className="text-muted-foreground">Date: 2024-01-15</div>
                      <div className="text-muted-foreground">Description: AUTO: Shell - 85% confidence</div>
                      <div className="h-px bg-border my-2" />
                      <div className="text-accent">DEBIT  4310 Brandstof €41.32</div>
                      <div className="text-muted-foreground pl-6">VAT 21% €8.68</div>
                      <div className="text-destructive">CREDIT 1600 Crediteuren €50.00</div>
                      <div className="h-px bg-border my-2" />
                      <div className="text-muted-foreground">Status: DRAFT (Ready for approval)</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-primary/5 border-primary/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Deployment Modes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <Badge className="mb-2 bg-accent text-accent-foreground">Redis Queue Mode</Badge>
                        <p className="text-muted-foreground text-xs">
                          API pushes jobs → Processor pulls → Scales horizontally
                        </p>
                      </div>
                      <div>
                        <Badge className="mb-2">Folder Watch Mode</Badge>
                        <p className="text-muted-foreground text-xs">
                          Polls /uploads every 10s → Simpler setup → Good for demos
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileCode size={24} className="text-primary" />
                      spark-worker/processor.py
                    </CardTitle>
                    <CardDescription>Complete OCR + AI + Database processor implementation</CardDescription>
                  </div>
                  <Button
                    onClick={() => copyToClipboard("# See spark-worker/processor.py in the repository\n# Full production-ready implementation with:\n# - OCR Engine (Tesseract)\n# - AI Prediction (12+ categories)\n# - Auto Draft Transactions\n# - Redis + Folder modes", 'Spark Processor Info')}
                    className="gap-2"
                  >
                    {copiedSection === 'Spark Processor Info' ? (
                      <>
                        <CheckCircle size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy Info
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Badge variant="secondary" className="justify-center">InvoiceOCRProcessor</Badge>
                  <Badge variant="secondary" className="justify-center">LedgerAccountPredictor</Badge>
                  <Badge variant="secondary" className="justify-center">DatabaseManager</Badge>
                  <Badge variant="secondary" className="justify-center">SparkInvoiceProcessor</Badge>
                </div>

                <div className="bg-secondary/30 rounded-lg p-4">
                  <h4 className="font-semibold mb-3 text-sm">Key Files Created:</h4>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-accent" />
                      <span>spark-worker/processor.py</span>
                      <Badge variant="outline" className="ml-auto">Core Logic</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-accent" />
                      <span>spark-worker/Dockerfile</span>
                      <Badge variant="outline" className="ml-auto">Container</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-accent" />
                      <span>spark-worker/requirements.txt</span>
                      <Badge variant="outline" className="ml-auto">Dependencies</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-accent" />
                      <span>spark-worker/README.md</span>
                      <Badge variant="outline" className="ml-auto">Documentation</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-accent" />
                      <span>spark-worker/test_processor.py</span>
                      <Badge variant="outline" className="ml-auto">Testing Tool</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileCode size={16} className="text-accent" />
                      <span>spark-worker/generate_test_invoices.py</span>
                      <Badge variant="outline" className="ml-auto">Test Data</Badge>
                    </div>
                  </div>
                </div>

                <div className="bg-accent/10 rounded-lg p-4 border border-accent/30">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Lightning size={18} className="text-accent" />
                    Quick Start Commands
                  </h4>
                  <div className="space-y-2 font-mono text-xs">
                    <div>
                      <div className="text-muted-foreground mb-1"># Build the processor</div>
                      <div className="bg-background/50 rounded p-2">docker build -t spark-processor ./spark-worker</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1"># Run in folder watch mode</div>
                      <div className="bg-background/50 rounded p-2">docker run -e PROCESSOR_MODE=folder spark-processor</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1"># Test prediction engine</div>
                      <div className="bg-background/50 rounded p-2">python3 test_processor.py --predict "Shell"</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1"># Generate test invoices</div>
                      <div className="bg-background/50 rounded p-2">python3 generate_test_invoices.py</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="space-y-6">
            <Card className="bg-gradient-to-r from-accent/20 to-primary/20 border-2 border-accent/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database size={24} className="text-accent" />
                  Database Schema Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Professional multi-tenant accounting schema designed to support Dutch accounting standards (RGS). 
                  Enables generation of Balans (Balance Sheet) and Winst & Verlies (Profit & Loss) reports.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Multi-Tenancy</h4>
                    <p className="text-xs text-muted-foreground">Each User can manage multiple Administrations (companies), like SnelStart's model</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Double-Entry Bookkeeping</h4>
                    <p className="text-xs text-muted-foreground">Transaction → TransactionLines (Debit/Credit must balance)</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Fiscal Periods</h4>
                    <p className="text-xs text-muted-foreground">FiscalYear tracks start/end dates for tax reporting</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Document Management</h4>
                    <p className="text-xs text-muted-foreground">Link invoices to transactions with OCR status tracking</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Database size={24} className="text-primary" />
                      backend/app/models.py
                    </CardTitle>
                    <CardDescription>Professional multi-tenant accounting schema with SQLAlchemy ORM</CardDescription>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(modelsCode, 'Models')}
                    className="gap-2"
                  >
                    {copiedSection === 'Models' ? (
                      <>
                        <CheckCircle size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Badge variant="secondary" className="justify-center">User (ZZP/Accountant)</Badge>
                  <Badge variant="secondary" className="justify-center">Administration (Tenant)</Badge>
                  <Badge variant="secondary" className="justify-center">FiscalYear</Badge>
                  <Badge variant="secondary" className="justify-center">GeneralLedger</Badge>
                  <Badge variant="secondary" className="justify-center">Transaction</Badge>
                  <Badge variant="secondary" className="justify-center">TransactionLine</Badge>
                  <Badge variant="secondary" className="justify-center">Document (OCR)</Badge>
                  <Badge variant="secondary" className="justify-center">Async PostgreSQL</Badge>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto max-h-[600px] overflow-y-auto">
                  <pre className="font-mono text-xs text-muted-foreground">
                    <code>{modelsCode}</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="space-y-6">
            <div className="grid gap-6">
              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Code size={24} className="text-primary" />
                        backend/app/main.py
                      </CardTitle>
                      <CardDescription>FastAPI application with CORS and async database</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(mainCode, 'Main API')}
                      className="gap-2"
                    >
                      {copiedSection === 'Main API' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{mainCode}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Code size={24} className="text-primary" />
                        backend/app/database.py
                      </CardTitle>
                      <CardDescription>Async SQLAlchemy session management</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(databaseCode, 'Database')}
                      className="gap-2"
                    >
                      {copiedSection === 'Database' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{databaseCode}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Code size={24} className="text-primary" />
                        backend/app/config.py
                      </CardTitle>
                      <CardDescription>Environment configuration with Pydantic</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(configCode, 'Config')}
                      className="gap-2"
                    >
                      {copiedSection === 'Config' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{configCode}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Code size={24} className="text-primary" />
                        backend/app/auth.py
                      </CardTitle>
                      <CardDescription>JWT authentication with password hashing</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(authCode, 'Auth')}
                      className="gap-2"
                    >
                      {copiedSection === 'Auth' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{authCode}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Code size={24} className="text-primary" />
                        backend/app/api/v1/auth.py
                      </CardTitle>
                      <CardDescription>Authentication endpoints: Register, Login, Me</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(authRouterCode, 'Auth Router')}
                      className="gap-2"
                    >
                      {copiedSection === 'Auth Router' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{authRouterCode}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="docker" className="space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileCode size={24} className="text-primary" />
                      docker-compose.yml
                    </CardTitle>
                    <CardDescription>Complete orchestration configuration</CardDescription>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(dockerCompose, 'Docker Compose')}
                    className="gap-2"
                  >
                    {copiedSection === 'Docker Compose' ? (
                      <>
                        <CheckCircle size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                  <pre className="font-mono text-xs text-muted-foreground">
                    <code>{dockerCompose}</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backend" className="space-y-6">
            <div className="grid gap-6">
              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileCode size={24} className="text-primary" />
                        Backend Dockerfile
                      </CardTitle>
                      <CardDescription>FastAPI service container</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(backendDockerfile, 'Backend Dockerfile')}
                      className="gap-2"
                    >
                      {copiedSection === 'Backend Dockerfile' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{backendDockerfile}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileCode size={24} className="text-primary" />
                        requirements.txt
                      </CardTitle>
                      <CardDescription>Python dependencies</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(requirements, 'Requirements')}
                      className="gap-2"
                    >
                      {copiedSection === 'Requirements' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{requirements}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <FileCode size={24} className="text-primary" />
                        Frontend Dockerfile
                      </CardTitle>
                      <CardDescription>React + Vite container</CardDescription>
                    </div>
                    <Button
                      onClick={() => copyToClipboard(frontendDockerfile, 'Frontend Dockerfile')}
                      className="gap-2"
                    >
                      {copiedSection === 'Frontend Dockerfile' ? (
                        <>
                          <CheckCircle size={18} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                    <pre className="font-mono text-xs text-muted-foreground">
                      <code>{frontendDockerfile}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="database" className="space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Database size={24} className="text-primary" />
                      Database Initialization Scripts
                    </CardTitle>
                    <CardDescription>PostgreSQL schema and tables</CardDescription>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(dbInit, 'Database Init')}
                    className="gap-2"
                  >
                    {copiedSection === 'Database Init' ? (
                      <>
                        <CheckCircle size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                  <pre className="font-mono text-xs text-muted-foreground">
                    <code>{dbInit}</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="setup" className="space-y-6">
            <Card className="bg-card/80 backdrop-blur-sm border-2 border-primary/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Terminal size={24} className="text-primary" />
                      Quick Start Commands
                    </CardTitle>
                    <CardDescription>Get your platform running in minutes</CardDescription>
                  </div>
                  <Button
                    onClick={() => copyToClipboard(setupCommands, 'Setup Commands')}
                    className="gap-2"
                  >
                    {copiedSection === 'Setup Commands' ? (
                      <>
                        <CheckCircle size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-secondary/30 rounded-lg p-4 overflow-x-auto">
                  <pre className="font-mono text-xs text-muted-foreground">
                    <code>{setupCommands}</code>
                  </pre>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-accent/10 border-accent/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Project Structure</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-xs space-y-1 text-muted-foreground">
                      <div>smart-accounting-platform/</div>
                      <div className="pl-4">├── frontend/</div>
                      <div className="pl-4">├── backend/</div>
                      <div className="pl-4">├── spark-worker/</div>
                      <div className="pl-4">├── database/init/</div>
                      <div className="pl-4">├── nginx/</div>
                      <div className="pl-4">└── docker-compose.yml</div>
                    </CardContent>
                  </Card>

                  <Card className="bg-accent/10 border-accent/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Useful Commands</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-xs space-y-2">
                      <div className="flex gap-2">
                        <span className="text-primary">docker-compose</span>
                        <span className="text-muted-foreground">ps</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-primary">docker-compose</span>
                        <span className="text-muted-foreground">logs -f api</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-primary">docker-compose</span>
                        <span className="text-muted-foreground">restart api</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="text-primary">docker-compose</span>
                        <span className="text-muted-foreground">exec api bash</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-r from-accent/20 to-primary/20 border-2 border-accent/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle size={24} className="text-accent" />
                  Next Steps
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Badge className="mt-1 bg-accent text-accent-foreground">✓</Badge>
                  <div>
                    <p className="font-semibold">Database Models & Schema</p>
                    <p className="text-sm text-muted-foreground">✅ Complete: Multi-tenant models with User, Administration, FiscalYear, GeneralLedger, Transaction, TransactionLine, Document</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-1 bg-accent text-accent-foreground">✓</Badge>
                  <div>
                    <p className="font-semibold">Backend API Core</p>
                    <p className="text-sm text-muted-foreground">✅ Complete: FastAPI with async PostgreSQL, JWT auth (Register/Login/Me), CORS configured</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">1</Badge>
                  <div>
                    <p className="font-semibold">Additional API Endpoints</p>
                    <p className="text-sm text-muted-foreground">Administration CRUD, Transaction posting, Ledger reports (Balans, Winst & Verlies)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">2</Badge>
                  <div>
                    <p className="font-semibold">Build Spark OCR Jobs</p>
                    <p className="text-sm text-muted-foreground">Image preprocessing, Tesseract integration, data extraction, PostgreSQL storage</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">3</Badge>
                  <div>
                    <p className="font-semibold">Frontend Development</p>
                    <p className="text-sm text-muted-foreground">Authentication, dashboard with KPIs, invoice upload, ledger reconciliation</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Badge className="mt-1">4</Badge>
                  <div>
                    <p className="font-semibold">Production Hardening</p>
                    <p className="text-sm text-muted-foreground">SSL certs, monitoring (Prometheus/Grafana), backup strategies, CI/CD pipeline</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="mt-8 bg-gradient-to-br from-primary/10 via-accent/10 to-primary/10 border-2 border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <FileCode size={32} className="text-primary" />
              <div className="flex-1">
                <p className="font-semibold">Complete Documentation Available</p>
                <p className="text-sm text-muted-foreground">
                  See <code className="bg-secondary px-2 py-1 rounded text-xs">ACCOUNTING_PLATFORM_ARCHITECTURE.md</code> in the project root for the full production-ready guide
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default App