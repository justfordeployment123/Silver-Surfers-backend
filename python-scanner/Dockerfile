# Python Scanner Service Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for Camoufox and browser automation
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    libu2f-udev \
    libvulkan1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Node.js and npm for Lighthouse
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install build dependencies for some packages (lxml, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libxml2-dev \
    libxslt1-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# Upgrade pip first
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install all dependencies from requirements.txt
# camoufox[geoip]>=0.4.1 will install the latest compatible version (0.4.1 or higher)
RUN pip install --no-cache-dir -r requirements.txt

# Download Camoufox browser (run after installation)
# This may fail in build, but will work at runtime
RUN python3 -m camoufox fetch 2>&1 || \
    camoufox fetch 2>&1 || \
    echo "Note: Camoufox browser will be downloaded at runtime if needed"

# Install Lighthouse and dependencies globally
RUN npm install -g lighthouse@latest chrome-launcher@latest

# Copy application code
COPY scanner_service.py .
COPY lighthouse_integration.py .
COPY lighthouse_runner.js .

# Copy Lighthouse configs and custom audits/gatherers
COPY lighthouse-configs/ /app/lighthouse-configs/

# Create temp directory for reports
RUN mkdir -p /tmp && chmod 777 /tmp

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    TEMP_DIR=/tmp \
    PORT=8001 \
    HOST=0.0.0.0

# Expose port
EXPOSE 8001

# Health check (using curl instead of requests to avoid dependency)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8001/health || exit 1

# Run the application
CMD ["uvicorn", "scanner_service:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--limit-concurrency", "10", "--timeout-keep-alive", "300"]

