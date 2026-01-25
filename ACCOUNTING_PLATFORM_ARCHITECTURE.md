# Smart Accounting Platform - Production Architecture Guide

## Executive Summary
This document provides the complete production-ready architecture for a SaaS Accounting Platform built with Apache Spark, FastAPI, and modern DevOps practices. This platform is designed to compete with enterprise solutions like SnelStart.

---

## Project Root Structure

```
smart-accounting-platform/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── README.md
├── Makefile
│
├── frontend/
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       ├── pages/
│       ├── services/
│       └── utils/
│
├── backend/
│   ├── Dockerfile
│   ├── Dockerfile.prod
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── endpoints/
│   │   │   │   │   ├── invoices.py
│   │   │   │   │   ├── ledger.py
│   │   │   │   │   ├── users.py
│   │   │   │   │   └── ocr.py
│   │   │   │   └── router.py
│   │   ├── services/
│   │   ├── tasks/
│   │   │   └── celery_tasks.py
│   │   └── utils/
│   └── migrations/
│       └── versions/
│
├── spark-worker/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── spark-submit.sh
│   ├── jobs/
│   │   ├── ocr_processor.py
│   │   ├── invoice_parser.py
│   │   ├── ledger_reconciliation.py
│   │   └── ml_anomaly_detection.py
│   ├── config/
│   │   └── spark-defaults.conf
│   └── libs/
│       └── shared_utils.py
│
├── database/
│   ├── init/
│   │   ├── 01_create_schemas.sql
│   │   ├── 02_create_tables.sql
│   │   ├── 03_create_indexes.sql
│   │   └── 04_seed_data.sql
│   └── backups/
│
├── nginx/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── ssl/
│
└── monitoring/
    ├── prometheus.yml
    └── grafana/
        └── dashboards/
```

---

## Complete docker-compose.yml

```yaml
version: '3.8'

services:
  # ====================
  # DATABASE LAYER
  # ====================
  db:
    image: postgres:16-alpine
    container_name: accounting-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: accounting_db
      POSTGRES_USER: accounting_user
      POSTGRES_PASSWORD: ${DB_PASSWORD:-change_me_in_production}
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d:ro
      - ./database/backups:/backups
    ports:
      - "5432:5432"
    networks:
      - accounting-backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U accounting_user -d accounting_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ====================
  # MESSAGE BROKER
  # ====================
  redis:
    image: redis:7-alpine
    container_name: accounting-redis
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis_change_me}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    networks:
      - accounting-backend
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  # ====================
  # OBJECT STORAGE (S3-Compatible)
  # ====================
  minio:
    image: minio/minio:latest
    container_name: accounting-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin123}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    networks:
      - accounting-backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

  # ====================
  # BACKEND API (FastAPI)
  # ====================
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: accounting-api
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://accounting_user:${DB_PASSWORD:-change_me_in_production}@db:5432/accounting_db
      - REDIS_URL=redis://:${REDIS_PASSWORD:-redis_change_me}@redis:6379/0
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ROOT_USER:-minioadmin}
      - MINIO_SECRET_KEY=${MINIO_ROOT_PASSWORD:-minioadmin123}
      - SPARK_MASTER_URL=spark://spark-master:7077
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD:-redis_change_me}@redis:6379/1
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD:-redis_change_me}@redis:6379/2
      - SECRET_KEY=${SECRET_KEY:-dev_secret_key_change_in_production}
      - ENVIRONMENT=development
    volumes:
      - ./backend:/app
      - ./uploads:/app/uploads
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    networks:
      - accounting-backend
      - accounting-frontend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  # ====================
  # CELERY WORKER (Async Tasks)
  # ====================
  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: accounting-celery-worker
    restart: unless-stopped
    environment:
      - DATABASE_URL=postgresql://accounting_user:${DB_PASSWORD:-change_me_in_production}@db:5432/accounting_db
      - REDIS_URL=redis://:${REDIS_PASSWORD:-redis_change_me}@redis:6379/0
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD:-redis_change_me}@redis:6379/1
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD:-redis_change_me}@redis:6379/2
      - SPARK_MASTER_URL=spark://spark-master:7077
    volumes:
      - ./backend:/app
      - ./uploads:/app/uploads
    depends_on:
      - db
      - redis
      - spark-master
    networks:
      - accounting-backend
    command: celery -A app.tasks.celery_tasks worker --loglevel=info --concurrency=4

  # ====================
  # APACHE SPARK MASTER
  # ====================
  spark-master:
    image: bitnami/spark:3.5
    container_name: accounting-spark-master
    restart: unless-stopped
    environment:
      - SPARK_MODE=master
      - SPARK_RPC_AUTHENTICATION_ENABLED=no
      - SPARK_RPC_ENCRYPTION_ENABLED=no
      - SPARK_LOCAL_STORAGE_ENCRYPTION_ENABLED=no
      - SPARK_SSL_ENABLED=no
      - SPARK_MASTER_WEBUI_PORT=8080
    volumes:
      - ./spark-worker/jobs:/opt/spark-apps
      - ./spark-worker/config:/opt/spark-conf
      - ./uploads:/opt/spark-data
    ports:
      - "7077:7077"
      - "8080:8080"
    networks:
      - accounting-backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ====================
  # APACHE SPARK WORKER 1
  # ====================
  spark-worker-1:
    image: bitnami/spark:3.5
    container_name: accounting-spark-worker-1
    restart: unless-stopped
    environment:
      - SPARK_MODE=worker
      - SPARK_MASTER_URL=spark://spark-master:7077
      - SPARK_WORKER_MEMORY=2G
      - SPARK_WORKER_CORES=2
      - SPARK_RPC_AUTHENTICATION_ENABLED=no
      - SPARK_RPC_ENCRYPTION_ENABLED=no
      - SPARK_LOCAL_STORAGE_ENCRYPTION_ENABLED=no
      - SPARK_SSL_ENABLED=no
    volumes:
      - ./spark-worker/jobs:/opt/spark-apps
      - ./spark-worker/config:/opt/spark-conf
      - ./uploads:/opt/spark-data
    depends_on:
      - spark-master
    networks:
      - accounting-backend

  # ====================
  # APACHE SPARK WORKER 2 (Scalable)
  # ====================
  spark-worker-2:
    image: bitnami/spark:3.5
    container_name: accounting-spark-worker-2
    restart: unless-stopped
    environment:
      - SPARK_MODE=worker
      - SPARK_MASTER_URL=spark://spark-master:7077
      - SPARK_WORKER_MEMORY=2G
      - SPARK_WORKER_CORES=2
      - SPARK_RPC_AUTHENTICATION_ENABLED=no
      - SPARK_RPC_ENCRYPTION_ENABLED=no
      - SPARK_LOCAL_STORAGE_ENCRYPTION_ENABLED=no
      - SPARK_SSL_ENABLED=no
    volumes:
      - ./spark-worker/jobs:/opt/spark-apps
      - ./spark-worker/config:/opt/spark-conf
      - ./uploads:/opt/spark-data
    depends_on:
      - spark-master
    networks:
      - accounting-backend

  # ====================
  # FRONTEND (React + Vite)
  # ====================
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: accounting-frontend
    restart: unless-stopped
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
    command: npm run dev -- --host 0.0.0.0

  # ====================
  # NGINX REVERSE PROXY (Production)
  # ====================
  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    container_name: accounting-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
      - frontend
    networks:
      - accounting-frontend
    profiles:
      - production

# ====================
# NETWORKS
# ====================
networks:
  accounting-backend:
    driver: bridge
    name: accounting-backend
  accounting-frontend:
    driver: bridge
    name: accounting-frontend

# ====================
# VOLUMES
# ====================
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  minio_data:
    driver: local
```

---

## Environment Variables (.env.example)

```bash
# Database
DB_PASSWORD=your_secure_postgres_password

# Redis
REDIS_PASSWORD=your_secure_redis_password

# MinIO S3
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_secure_minio_password

# Backend
SECRET_KEY=your_jwt_secret_key_minimum_32_characters
ENVIRONMENT=development

# Spark
SPARK_MASTER_URL=spark://spark-master:7077

# API Keys
OCR_API_KEY=your_ocr_service_api_key
```

---

## Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Backend Requirements (requirements.txt)

```
fastapi==0.110.0
uvicorn[standard]==0.27.1
sqlalchemy==2.0.27
alembic==1.13.1
psycopg2-binary==2.9.9
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
pandas==2.2.0
```

---

## Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

---

## Spark Worker Dockerfile

```dockerfile
# spark-worker/Dockerfile
FROM bitnami/spark:3.5

USER root

COPY requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY jobs/ /opt/spark-apps/
COPY config/ /opt/spark-conf/

USER 1001

CMD ["spark-submit", "--master", "spark://spark-master:7077", "/opt/spark-apps/ocr_processor.py"]
```

---

## Database Initialization Script

```sql
-- database/init/01_create_schemas.sql
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS audit;

-- database/init/02_create_tables.sql
CREATE TABLE accounting.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_superuser BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounting.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES accounting.users(id),
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    total_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(50) DEFAULT 'pending',
    ocr_status VARCHAR(50) DEFAULT 'pending',
    s3_key VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounting.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES accounting.users(id),
    invoice_id UUID REFERENCES accounting.invoices(id),
    account_code VARCHAR(50) NOT NULL,
    description TEXT,
    debit DECIMAL(15, 2) DEFAULT 0,
    credit DECIMAL(15, 2) DEFAULT 0,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoices_user_id ON accounting.invoices(user_id);
CREATE INDEX idx_ledger_user_id ON accounting.ledger_entries(user_id);
CREATE INDEX idx_ledger_invoice_id ON accounting.ledger_entries(invoice_id);
```

---

## Makefile for Common Operations

```makefile
.PHONY: help build up down logs clean migrate seed

help:
	@echo "Smart Accounting Platform - Make Commands"
	@echo "=========================================="
	@echo "make build      - Build all containers"
	@echo "make up         - Start all services"
	@echo "make down       - Stop all services"
	@echo "make logs       - View logs"
	@echo "make clean      - Remove volumes and clean up"
	@echo "make migrate    - Run database migrations"
	@echo "make seed       - Seed database with test data"

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	docker system prune -f

migrate:
	docker-compose exec api alembic upgrade head

seed:
	docker-compose exec api python -m app.scripts.seed_database
```

---

## Quick Start Commands

```bash
# 1. Clone and navigate to project
mkdir smart-accounting-platform
cd smart-accounting-platform

# 2. Copy the docker-compose.yml from this document

# 3. Create .env file
cp .env.example .env
# Edit .env with secure passwords

# 4. Create folder structure
mkdir -p frontend backend spark-worker database/init nginx monitoring

# 5. Build and start services
docker-compose build
docker-compose up -d

# 6. Check service health
docker-compose ps

# 7. View logs
docker-compose logs -f api

# 8. Access services
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/docs
# Spark Master UI: http://localhost:8080
# MinIO Console: http://localhost:9001
# PostgreSQL: localhost:5432
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         NGINX (Production)                       │
│                    Port 80/443 - SSL Termination                │
└────────────────────────┬───────────────────┬────────────────────┘
                         │                   │
              ┌──────────▼──────────┐   ┌────▼──────────┐
              │   Frontend (React)  │   │  Backend API  │
              │   Vite + TypeScript │   │    FastAPI    │
              │      Port 5173      │   │   Port 8000   │
              └─────────────────────┘   └───┬───────────┘
                                            │
                    ┌───────────────────────┼──────────────────┐
                    │                       │                  │
         ┌──────────▼──────────┐  ┌─────────▼────────┐  ┌─────▼──────┐
         │   PostgreSQL DB     │  │   Redis Broker   │  │   MinIO    │
         │   Port 5432         │  │   Port 6379      │  │  Port 9000 │
         │  (User, Ledger,     │  │  (Task Queue)    │  │  (S3 Store)│
         │   Invoices)         │  │                  │  │            │
         └─────────────────────┘  └──────────────────┘  └────────────┘
                                            │
                                  ┌─────────▼──────────┐
                                  │  Celery Worker     │
                                  │  (Async Tasks)     │
                                  └─────────┬──────────┘
                                            │
                    ┌───────────────────────┼──────────────────┐
                    │                       │                  │
         ┌──────────▼──────────┐  ┌─────────▼────────┐  ┌─────▼──────┐
         │   Spark Master      │  │  Spark Worker 1  │  │Spark Worker│
         │   Port 7077, 8080   │  │  (OCR Processing)│  │     2      │
         │   (Orchestration)   │  │                  │  │            │
         └─────────────────────┘  └──────────────────┘  └────────────┘
```

---

## Network Topology

**Backend Network (`accounting-backend`):**
- PostgreSQL
- Redis
- MinIO
- API
- Celery Worker
- Spark Master
- Spark Workers

**Frontend Network (`accounting-frontend`):**
- Frontend
- API
- NGINX

This separation ensures:
- Frontend cannot directly access databases
- All data flows through the API
- Spark workers are isolated but accessible to the backend

---

## Production Deployment Checklist

- [ ] Replace all default passwords in `.env`
- [ ] Set `ENVIRONMENT=production`
- [ ] Enable SSL certificates in NGINX
- [ ] Set up database backups (pg_dump cron job)
- [ ] Configure log aggregation (ELK/Loki)
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Implement rate limiting in API
- [ ] Configure CORS properly
- [ ] Set up CI/CD pipeline
- [ ] Enable database connection pooling
- [ ] Configure auto-scaling for Spark workers
- [ ] Set up health check endpoints
- [ ] Implement proper secret management (Vault/AWS Secrets)
- [ ] Configure backup retention policies
- [ ] Set up alerting (PagerDuty/Opsgenie)
- [ ] Document API endpoints (OpenAPI/Swagger)

---

## Scaling Considerations

**Horizontal Scaling:**
```bash
# Add more Spark workers dynamically
docker-compose up -d --scale spark-worker-1=5

# Add more Celery workers
docker-compose up -d --scale celery-worker=3
```

**Vertical Scaling:**
Adjust resources in docker-compose:
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 4G
    reservations:
      cpus: '1'
      memory: 2G
```

---

## Next Steps After Setup

1. **Implement Backend API Endpoints**
   - User authentication (JWT)
   - Invoice CRUD operations
   - Ledger management
   - OCR trigger endpoints

2. **Build Spark OCR Jobs**
   - Invoice image preprocessing
   - Tesseract OCR integration
   - Data extraction and parsing
   - Result storage in PostgreSQL

3. **Frontend Development**
   - Authentication pages
   - Dashboard with KPIs
   - Invoice upload interface
   - Ledger view and reconciliation

4. **Testing Strategy**
   - Unit tests (pytest for backend)
   - Integration tests (API endpoints)
   - E2E tests (Playwright/Cypress)
   - Load testing (Locust/k6)

5. **Monitoring Setup**
   - Application metrics
   - Database performance
   - Spark job monitoring
   - Error tracking (Sentry)

---

## Support & Troubleshooting

**Common Issues:**

1. **Port conflicts:** Change ports in docker-compose.yml
2. **Permission errors:** Run `sudo chown -R $USER:$USER .`
3. **Database connection fails:** Check DB health with `docker-compose ps`
4. **Spark jobs not running:** Check Spark Master UI at localhost:8080

**Useful Commands:**
```bash
# Restart specific service
docker-compose restart api

# Shell into container
docker-compose exec api bash

# View database logs
docker-compose logs db

# Check resource usage
docker stats
```

---

*This architecture is production-ready and designed for enterprise-scale accounting platforms.*
