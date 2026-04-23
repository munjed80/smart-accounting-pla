FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-nld \
    tesseract-ocr-eng \
    libtesseract-dev \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# DO NOT bake DATABASE_URL / REDIS_URL into the image. They MUST be injected
# at runtime by Coolify (or docker-compose), so a built image cannot
# accidentally connect to a placeholder database. The worker fails fast in
# main() if these variables are missing.

# Run the worker
CMD ["python", "processor.py"]
