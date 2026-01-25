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
  FileCode
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

# Create docker-compose.yml
# (paste the docker-compose configuration)

# Create .env file
cat > .env << EOF
DB_PASSWORD=your_secure_password_here
REDIS_PASSWORD=your_redis_password
SECRET_KEY=your_jwt_secret_key_32_chars_min
EOF

# Build and start services
docker-compose build
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f api

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

  const dbInit = `-- database/init/01_create_schemas.sql
CREATE SCHEMA IF NOT EXISTS accounting;
CREATE SCHEMA IF NOT EXISTS audit;

-- database/init/02_create_tables.sql
CREATE TABLE accounting.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE accounting.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES accounting.users(id),
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(50) DEFAULT 'pending',
    ocr_status VARCHAR(50) DEFAULT 'pending',
    s3_key VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX idx_ledger_user_id ON accounting.ledger_entries(user_id);`

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
            Production-Ready Apache Spark + FastAPI Architecture
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
          <TabsList className="grid w-full grid-cols-5 h-auto p-1 bg-card/50 backdrop-blur-sm">
            <TabsTrigger value="overview" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <GitBranch size={20} />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="docker" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ShareNetwork size={20} />
              <span className="hidden sm:inline">Docker</span>
            </TabsTrigger>
            <TabsTrigger value="backend" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <HardDrives size={20} />
              <span className="hidden sm:inline">Backend</span>
            </TabsTrigger>
            <TabsTrigger value="database" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database size={20} />
              <span className="hidden sm:inline">Database</span>
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
                  <Badge className="mt-1">1</Badge>
                  <div>
                    <p className="font-semibold">Implement Backend API Endpoints</p>
                    <p className="text-sm text-muted-foreground">User auth (JWT), Invoice CRUD, Ledger management, OCR triggers</p>
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