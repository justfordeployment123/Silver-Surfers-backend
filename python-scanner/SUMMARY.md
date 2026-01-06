# Python Scanner Service - Implementation Summary

## What Was Created

A complete Python microservice that provides advanced website scanning capabilities as a fallback when Node.js scanning methods fail due to bot detection.

## Files Created

1. **`scanner_service.py`** - Main FastAPI service with:
   - Playwright with stealth techniques for anti-detection
   - Accessibility audits compatible with Lighthouse format
   - Same scoring logic as Node.js (`calculateLiteScore` and `calculateSeniorFriendlinessScore`)
   - Support for desktop, mobile, and tablet devices
   - Lite and full audit modes

2. **`python-scanner-client.js`** - Node.js client that:
   - Calls Python service when Node.js strategies fail
   - Converts Python responses to Node.js format
   - Handles errors gracefully

3. **`requirements.txt`** - Python dependencies:
   - FastAPI for API server
   - Playwright for browser automation
   - playwright-stealth for anti-detection
   - BeautifulSoup for HTML parsing

4. **`README.md`** - Setup and usage documentation

5. **`INTEGRATION.md`** - Detailed integration guide

6. **`setup.sh`** - Automated setup script

## Key Features

### ✅ Advanced Anti-Detection
- Uses Playwright with stealth plugins
- Custom user agents and headers
- Browser fingerprint masking
- Human-like behavior simulation

### ✅ Lighthouse-Compatible Results
- Returns audit results in Lighthouse JSON format
- Same audit IDs and structure as Node.js
- Compatible with existing report generators

### ✅ Same Scoring Logic
- **Lite Audits**: Matches `custom-config-lite.js` weights exactly
- **Full Audits**: Matches `custom-config.js` weights exactly
- Calculation: `(totalWeightedScore / totalWeight) * 100`

### ✅ Automatic Fallback
- Integrated into `audit-module-with-lite.js`
- Automatically called when all Node.js strategies fail
- No code changes needed in calling code

## How It Works

```
1. Node.js tries: basic → stealth → aggressive strategies
2. If all fail → Calls Python scanner automatically
3. Python uses Playwright with stealth to scan
4. Returns Lighthouse-compatible JSON
5. Node.js processes result normally (PDF generation, email, etc.)
```

## Quick Start

### 1. Install Dependencies
```bash
cd backend-silver-surfers/python-scanner
pip install -r requirements.txt
playwright install chromium
```

### 2. Run Service
```bash
python scanner_service.py
# Or: uvicorn scanner_service:app --host 0.0.0.0 --port 8001
```

### 3. That's It!
The Node.js service will automatically use Python scanner as fallback.

## API Endpoints

### POST /audit
Perform accessibility audit.

**Request:**
```json
{
  "url": "https://example.com",
  "device": "desktop",
  "format": "json",
  "isLiteVersion": false
}
```

**Response:**
```json
{
  "success": true,
  "reportPath": "/tmp/report-example-com-1234567890.json",
  "report": { ... },  // Lighthouse-compatible
  "version": "Full",
  "device": "desktop",
  "strategy": "Python-Playwright"
}
```

### GET /health
Health check endpoint.

## About Camoufox

This implementation uses **Camoufox**, a Python package that wraps Playwright and provides advanced anti-detection capabilities:

- ✅ **Automatic Fingerprinting**: Generates unique device characteristics (OS, CPU, navigator properties, fonts, headers, screen dimensions, viewport, WebGL, addons)
- ✅ **Better Anti-Detection**: More effective than standard Puppeteer/Playwright at bypassing bot protection
- ✅ **Playwright-Compatible**: Uses Playwright under the hood, so all Playwright APIs work
- ✅ **Production-Ready**: Widely used for web scraping and automation tasks
- ✅ **Easy to Use**: Simple API that handles all the complexity automatically

## Testing

Test the Python service directly:
```bash
curl -X POST http://localhost:8001/audit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "device": "desktop", "format": "json", "isLiteVersion": false}'
```

## Next Steps

1. **Install and test** the Python service
2. **Monitor logs** to see when Python scanner is used
3. **Adjust timeouts** if needed (default: 3 minutes)
4. **Scale** by running multiple Python service instances if needed

## Support

For issues or questions:
- Check `INTEGRATION.md` for detailed setup
- Check logs for error messages
- Verify Python service is running: `curl http://localhost:8001/health`

