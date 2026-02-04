FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
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
