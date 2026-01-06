# Python Scanner Service for SilverSurfers

This Python microservice provides advanced website scanning capabilities using Playwright with stealth techniques to bypass bot detection. It performs accessibility audits compatible with Lighthouse format and calculates scores using the same logic as the Node.js implementation.

## Features

- **Advanced Anti-Detection**: Uses Camoufox (Playwright wrapper) with automatic fingerprint generation to bypass bot protection
- **Lighthouse-Compatible**: Returns audit results in Lighthouse JSON format
- **Same Scoring Logic**: Implements the same `calculateLiteScore` and `calculateSeniorFriendlinessScore` logic as Node.js
- **Device Support**: Supports desktop, mobile, and tablet device emulation
- **Lite & Full Audits**: Supports both lite and full accessibility audits
- **Automatic Fingerprinting**: Camoufox automatically generates unique device characteristics (OS, CPU, navigator properties, fonts, headers, etc.)

## Installation

1. Install Python dependencies:
```bash
cd python-scanner
pip install -r requirements.txt
```

2. Download Camoufox browser:
```bash
camoufox fetch
```

   Or on some systems:
```bash
python3 -m camoufox fetch
```

## Running the Service

### Development Mode
```bash
python scanner_service.py
```

### Production Mode (using uvicorn)
```bash
uvicorn scanner_service:app --host 0.0.0.0 --port 8001
```

The service will be available at `http://localhost:8001`

## API Endpoints

### POST /audit
Perform an accessibility audit.

**Request Body:**
```json
{
  "url": "https://example.com",
  "device": "desktop",  // desktop, mobile, or tablet
  "format": "json",     // json or html
  "isLiteVersion": false
}
```

**Response:**
```json
{
  "success": true,
  "reportPath": "/tmp/report-example-com-1234567890.json",
  "report": { ... },  // Lighthouse-compatible JSON
  "isLiteVersion": false,
  "version": "Full",
  "url": "https://example.com",
  "device": "desktop",
  "strategy": "Python-Camoufox",
  "attemptNumber": 1,
  "message": "Full audit completed successfully using Python/Camoufox strategy"
}
```

### GET /health
Health check endpoint.

## Integration with Node.js

The Node.js service can call this Python service as a fallback when standard methods fail. Example integration:

```javascript
import axios from 'axios';

async function tryPythonScanner(url, options) {
  try {
    const response = await axios.post('http://localhost:8001/audit', {
      url: url,
      device: options.device || 'desktop',
      format: 'json',
      isLiteVersion: options.isLiteVersion || false
    });
    
    if (response.data.success) {
      return {
        success: true,
        reportPath: response.data.reportPath,
        // ... other fields
      };
    }
  } catch (error) {
    console.error('Python scanner failed:', error.message);
    return { success: false, error: error.message };
  }
}
```

## Docker Support

To run in Docker, add to your Dockerfile:

```dockerfile
# Python scanner service
WORKDIR /app/python-scanner
COPY python-scanner/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN camoufox fetch

# Run Python service
CMD ["uvicorn", "scanner_service:app", "--host", "0.0.0.0", "--port", "8001"]
```

## Notes

- The service uses Camoufox, which wraps Playwright and automatically generates realistic browser fingerprints
- Camoufox handles OS info, CPU details, navigator properties, fonts, headers, screen dimensions, viewport, WebGL, and more
- Audit results are compatible with Lighthouse format
- Scoring logic matches the Node.js implementation exactly
- The service saves reports to `/tmp` by default (configurable via `TEMP_DIR` env var)

