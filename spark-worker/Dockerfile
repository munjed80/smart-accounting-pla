FROM bitnami/spark:3.5

USER root

# Install system dependencies for OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-nld \
    tesseract-ocr-eng \
    libtesseract-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/spark-apps

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the processor script
COPY processor.py .

# Environment variables (can be overridden in docker-compose)
ENV DATABASE_URL="postgresql://accounting_user:change_me@db:5432/accounting_db"
ENV REDIS_URL="redis://redis:6379/0"
ENV UPLOADS_PATH="/opt/spark-data"
ENV PROCESSOR_MODE="folder"

# Run the processor
CMD ["python3", "processor.py"]
