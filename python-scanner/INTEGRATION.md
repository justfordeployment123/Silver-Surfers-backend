# Python Scanner Integration Guide

## Overview

The Python Scanner Service is a microservice that provides advanced website scanning capabilities using Playwright with stealth techniques. It serves as a fallback when Node.js scanning methods fail due to bot detection.

## Architecture

```
Node.js Service (Primary)
    ↓ (if all strategies fail)
Python Scanner Service (Fallback)
    ↓
Returns Lighthouse-compatible JSON
    ↓
Node.js processes report normally
```

## Setup

### 1. Install Python Dependencies

```bash
cd backend-silver-surfers/python-scanner
pip install -r requirements.txt
playwright install chromium
```

### 2. Run Python Service

**Development:**
```bash
python scanner_service.py
```

**Production (using uvicorn):**
```bash
uvicorn scanner_service:app --host 0.0.0.0 --port 8001
```

### 3. Configure Node.js

The Node.js service will automatically try the Python scanner when all Node.js strategies fail. The Python service URL can be configured via environment variable:

```bash
PYTHON_SCANNER_URL=http://localhost:8001
```

If not set, it defaults to `http://localhost:8001`.

## How It Works

### Automatic Fallback

When `runLighthouseAudit` or `runLighthouseLiteAudit` exhausts all Node.js strategies (basic, stealth, aggressive), it automatically attempts the Python scanner:

```javascript
// In audit-module-with-lite.js
// After all Node.js strategies fail:
const pythonResult = await tryPythonScanner({
    url: fullUrl,
    device: device,
    format: format,
    isLiteVersion: isLiteVersion
});
```

### Response Format

The Python service returns results in the same format as Node.js Lighthouse audits:

```json
{
  "success": true,
  "reportPath": "/tmp/report-example-com-1234567890.json",
  "report": {
    "lighthouseVersion": "10.0.0",
    "categories": {
      "senior-friendly-lite": {
        "score": 0.79
      }
    },
    "audits": { ... }
  }
}
```

### Scoring Logic

The Python service implements the **exact same scoring logic** as Node.js:

- **Lite Audits**: Uses `LITE_AUDIT_REFS` with weights matching `custom-config-lite.js`
- **Full Audits**: Uses `FULL_AUDIT_REFS` with weights matching `custom-config.js`
- **Calculation**: `(totalWeightedScore / totalWeight) * 100`

## Docker Integration

### Option 1: Separate Container

```dockerfile
# Dockerfile.python-scanner
FROM python:3.11-slim

WORKDIR /app
COPY python-scanner/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium
RUN playwright install-deps chromium

COPY python-scanner/ .
CMD ["uvicorn", "scanner_service:app", "--host", "0.0.0.0", "--port", "8001"]
```

```yaml
# docker-compose.yml
services:
  nodejs:
    build: .
    # ... nodejs config
  
  python-scanner:
    build:
      context: .
      dockerfile: Dockerfile.python-scanner
    ports:
      - "8001:8001"
    environment:
      - TEMP_DIR=/tmp
```

### Option 2: Same Container (Multi-stage)

Add to your existing Dockerfile:

```dockerfile
# Install Python and dependencies
RUN apt-get update && apt-get install -y python3 python3-pip
WORKDIR /app/python-scanner
COPY python-scanner/requirements.txt .
RUN pip3 install -r requirements.txt
RUN playwright install chromium
RUN playwright install-deps chromium

# Run both services
CMD ["sh", "-c", "uvicorn scanner_service:app --host 0.0.0.0 --port 8001 & node my-app/services/server/server.js"]
```

## Testing

### Test Python Service Directly

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

### Test Health Endpoint

```bash
curl http://localhost:8001/health
```

### Test from Node.js

The Python scanner will be automatically called when Node.js strategies fail. To force a test:

1. Temporarily disable all Node.js strategies
2. Or use a URL known to block Node.js scanners
3. Check logs for: `🐍 Attempting Python scanner...`

## Monitoring

### Logs

The Python service logs:
- `✅ {version} audit completed successfully`
- `📊 Score: {score}%`
- `📄 Report saved to: {path}`

The Node.js service logs:
- `🐍 Attempting Python scanner for: {url}`
- `✅ Python scanner succeeded for: {url}`
- `❌ Python scanner also failed: {error}`

### Health Checks

Monitor the Python service health:

```bash
# In your monitoring system
curl http://localhost:8001/health
```

## Troubleshooting

### Python Service Not Available

If the Python service is down, Node.js will log:
```
⚠️ Python scanner service not available at http://localhost:8001
```

The audit will still fail, but gracefully without crashing.

### Connection Refused

Check:
1. Python service is running: `ps aux | grep uvicorn`
2. Port is open: `netstat -tuln | grep 8001`
3. Firewall rules allow port 8001

### Timeout Issues

Increase timeout in `python-scanner-client.js`:
```javascript
timeout: 180000, // 3 minutes (default)
```

### Playwright Browser Issues

If Playwright fails to launch:
```bash
playwright install chromium
playwright install-deps chromium
```

## Performance

- **Typical Audit Time**: 30-60 seconds
- **Timeout**: 3 minutes (180 seconds)
- **Concurrency**: Python service can handle multiple requests (FastAPI async)

## Security

- Python service runs on internal network (not exposed publicly)
- Use environment variables for configuration
- Reports saved to `/tmp` (configurable via `TEMP_DIR`)

## Future Enhancements

Potential improvements:
1. Use `axe-core` Python bindings for more accurate accessibility audits
2. Add caching for frequently scanned URLs
3. Implement request queuing for high load
4. Add metrics/monitoring endpoints
5. Support for more advanced anti-detection techniques

