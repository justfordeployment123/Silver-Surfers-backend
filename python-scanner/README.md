# Python Scanner Service

A FastAPI microservice for bypassing bot detection when scanning websites.

## Installation

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers (if using Playwright)
playwright install chromium
```

## Running

```bash
# Development
uvicorn example_scanner:app --reload --port 8001

# Production
uvicorn example_scanner:app --host 0.0.0.0 --port 8001
```

## API Endpoints

### POST /scan/prepare
Prepare a page for scanning by bypassing bot detection.

**Request:**
```json
{
  "url": "https://example.com",
  "device": "desktop",
  "method": "auto"
}
```

**Response:**
```json
{
  "success": true,
  "final_url": "https://example.com",
  "html_file": "/tmp/page_1234567890.html",
  "method_used": "undetected-chromedriver",
  "status_code": 200
}
```

### GET /health
Check service health and available methods.

## Integration with Node.js

See `PYTHON_SCANNING_SCENARIOS.md` for integration examples.

