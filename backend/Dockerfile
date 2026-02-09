FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including WeasyPrint runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    # WeasyPrint system dependencies
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    libjpeg62-turbo \
    libpng16-16 \
    libxml2 \
    libxslt1.1 \
    libglib2.0-0 \
    libgobject-2.0-0 \
    fonts-dejavu \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Build arguments for version tracking
ARG GIT_SHA=unknown
ARG BUILD_TIME

# Set environment variables for version endpoint
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Make startup script executable
RUN chmod +x /app/startup.sh

# Create uploads directory
RUN mkdir -p /data/uploads

# Expose port
EXPOSE 8000

# Run the startup script which handles migrations and starts uvicorn
CMD ["/app/startup.sh"]
