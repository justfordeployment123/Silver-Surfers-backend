# Docker Deployment Guide for Python Scanner Service

## Quick Start

### 1. Build and Run with Docker

```bash
cd backend-silver-surfers/python-scanner

# Build the image
docker build -t silversurfers-python-scanner .

# Run the container
docker run -d \
  --name python-scanner \
  -p 8001:8001 \
  -e TEMP_DIR=/tmp \
  silversurfers-python-scanner
```

### 2. Using Docker Compose

```bash
cd backend-silver-surfers/python-scanner

# Copy environment file
cp .env.example .env

# Edit .env if needed
nano .env

# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

---

## Environment Variables

Create a `.env` file in the `python-scanner` directory:

```bash
# Required
SCANNER_PORT=8001
TEMP_DIR=/tmp

# Optional
PYTHON_SCANNER_URL=http://localhost:8001
LOG_LEVEL=INFO
```

### Environment Variables Explained

| Variable | Default | Description |
|----------|---------|-------------|
| `SCANNER_PORT` | `8001` | Port for the Python scanner service |
| `TEMP_DIR` | `/tmp` | Directory for temporary report files |
| `PYTHON_SCANNER_URL` | `http://localhost:8001` | URL used by Node.js to connect (for reference) |
| `PYTHONUNBUFFERED` | `1` | Ensures Python output is not buffered (better logs) |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |

---

## Docker Commands

### Build Image

```bash
docker build -t silversurfers-python-scanner .
```

### Run Container

```bash
docker run -d \
  --name python-scanner \
  -p 8001:8001 \
  -e TEMP_DIR=/tmp \
  -v $(pwd)/tmp:/tmp \
  silversurfers-python-scanner
```

### View Logs

```bash
# Docker
docker logs -f python-scanner

# Docker Compose
docker-compose logs -f
```

### Stop Container

```bash
# Docker
docker stop python-scanner
docker rm python-scanner

# Docker Compose
docker-compose down
```

### Restart Container

```bash
# Docker
docker restart python-scanner

# Docker Compose
docker-compose restart
```

### Execute Commands in Container

```bash
docker exec -it python-scanner bash
```

### Check Health

```bash
# Health check endpoint
curl http://localhost:8001/health

# Should return: {"status":"healthy","service":"python-scanner"}
```

---

## Testing the Service

### 1. Health Check

```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "python-scanner"
}
```

### 2. Test Audit Endpoint

```bash
curl -X POST http://localhost:8001/audit \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "device": "desktop",
    "format": "json",
    "isLiteVersion": false
  }'
```

Expected response:
```json
{
  "success": true,
  "reportPath": "/tmp/report-example-com-1234567890.json",
  "report": { ... },
  "version": "Full",
  "device": "desktop",
  "strategy": "Python-Camoufox"
}
```

---

## Integration with Node.js

### Update Node.js Environment

In your Node.js `.env` file, set:

```bash
PYTHON_SCANNER_URL=http://localhost:8001
```

Or if running in Docker network:

```bash
PYTHON_SCANNER_URL=http://python-scanner:8001
```

### Docker Network Setup

If both services are in Docker:

```yaml
# docker-compose.yml (for both services)
services:
  nodejs:
    # ... nodejs config
    networks:
      - silversurfers-network
    environment:
      - PYTHON_SCANNER_URL=http://python-scanner:8001

  python-scanner:
    # ... python scanner config
    networks:
      - silversurfers-network
```

---

## Volume Mounts

### Persist Reports

To persist reports outside the container:

```bash
docker run -d \
  --name python-scanner \
  -p 8001:8001 \
  -v $(pwd)/reports:/tmp \
  silversurfers-python-scanner
```

Or in `docker-compose.yml`:

```yaml
volumes:
  - ./reports:/tmp
```

---

## Resource Limits

### Recommended Settings

```yaml
# docker-compose.yml
services:
  python-scanner:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Memory Considerations

- Each Camoufox browser instance uses ~100-200MB RAM
- With 5 parallel scans: ~500MB-1GB RAM
- Recommended: 2GB minimum, 4GB for high concurrency

---

## Troubleshooting

### Container Won't Start

1. **Check logs**:
   ```bash
   docker logs python-scanner
   ```

2. **Check if port is available**:
   ```bash
   lsof -i :8001
   ```

3. **Check Camoufox installation**:
   ```bash
   docker exec -it python-scanner camoufox --version
   ```

### Camoufox Browser Not Found

If you see errors about Camoufox browser:

```bash
# Rebuild with browser download
docker build --no-cache -t silversurfers-python-scanner .
```

### Connection Refused

If Node.js can't connect:

1. **Check if service is running**:
   ```bash
   docker ps | grep python-scanner
   ```

2. **Check network**:
   ```bash
   docker network inspect silversurfers-network
   ```

3. **Test from Node.js container**:
   ```bash
   docker exec -it nodejs-container curl http://python-scanner:8001/health
   ```

### High Memory Usage

If memory usage is high:

1. **Reduce concurrency** in `scanner_service.py`:
   ```python
   limit_concurrency=5  # Reduce from 10
   ```

2. **Reduce queue concurrency** in Node.js:
   ```javascript
   concurrency: 3  // Reduce from 5
   ```

---

## Production Deployment

### 1. Use Docker Compose

```bash
docker-compose -f docker-compose.yml up -d
```

### 2. Set Up Reverse Proxy (Optional)

```nginx
# nginx.conf
upstream python_scanner {
    server localhost:8001;
}

server {
    listen 80;
    server_name scanner.example.com;

    location / {
        proxy_pass http://python_scanner;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. Monitor Health

```bash
# Add to monitoring system
curl http://localhost:8001/health
```

### 4. Log Management

```yaml
# docker-compose.yml
services:
  python-scanner:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Development

### Run with Hot Reload

For development, mount the code:

```bash
docker run -d \
  --name python-scanner-dev \
  -p 8001:8001 \
  -v $(pwd)/scanner_service.py:/app/scanner_service.py \
  silversurfers-python-scanner \
  uvicorn scanner_service:app --host 0.0.0.0 --port 8001 --reload
```

---

## Security Considerations

1. **Don't expose port publicly** - Use reverse proxy with authentication
2. **Use Docker secrets** for sensitive data
3. **Limit resource usage** to prevent DoS
4. **Regular updates** - Keep base image and dependencies updated

---

## Next Steps

1. **Build and test** the Docker image
2. **Configure environment** variables
3. **Update Node.js** to use Docker service URL
4. **Monitor** logs and performance
5. **Scale** if needed (multiple instances behind load balancer)


