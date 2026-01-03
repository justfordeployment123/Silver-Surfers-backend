# Python-Based Website Scanning - Implementation Scenarios

## Overview
This document outlines various approaches to integrate Python-based web scanning into the SilverSurfers platform for better anti-bot detection bypass capabilities.

## Why Python for Web Scanning?

### Advantages:
1. **Better Anti-Detection Libraries**: Python has mature libraries specifically designed to bypass bot detection
2. **Undetected ChromeDriver**: More effective than standard Selenium
3. **Cloudscraper**: Specialized for bypassing Cloudflare and similar protections
4. **Selenium-Stealth**: Advanced stealth techniques
5. **Better Proxy Support**: Easier integration with residential proxies
6. **CAPTCHA Solving**: Better integration with 2Captcha, AntiCaptcha, etc.

### Python Libraries for Anti-Detection:
- **undetected-chromedriver** - Best for bypassing detection
- **selenium-stealth** - Advanced stealth techniques
- **cloudscraper** - Cloudflare bypass
- **playwright-python** - Modern browser automation
- **requests-html** - Lightweight scraping
- **httpx** - Modern HTTP client with better headers

---

## Scenario 1: Python Microservice (Recommended)

### Architecture:
```
Node.js Backend → Python Microservice (FastAPI/Flask) → Returns HTML/Data → Node.js runs Lighthouse
```

### Implementation:
1. **Python Service** handles navigation and bypasses bot detection
2. **Returns** either:
   - HTML content (Node.js saves and runs Lighthouse on it)
   - Screenshot/HTML file path
   - Success flag + final URL
3. **Node.js** continues with Lighthouse audit on the successfully loaded page

### Pros:
- ✅ Best of both worlds (Python anti-detection + Node.js Lighthouse)
- ✅ Can scale Python service independently
- ✅ Easy to update Python code without touching Node.js
- ✅ Can use different Python libraries per site type
- ✅ Maintains existing Node.js infrastructure

### Cons:
- ⚠️ Requires inter-process communication
- ⚠️ Slight latency overhead
- ⚠️ Need to manage Python service separately

### Code Example:

**Python Service (FastAPI):**
```python
from fastapi import FastAPI
from undetected_chromedriver import uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import json

app = FastAPI()

@app.post("/scan/prepare")
async def prepare_page(url: str, device: str = "desktop"):
    """
    Navigate to URL, bypass bot detection, return HTML or file path
    """
    options = uc.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    # Set viewport based on device
    if device == "mobile":
        options.add_argument('--window-size=375,667')
    else:
        options.add_argument('--window-size=1920,1080')
    
    driver = uc.Chrome(options=options, version_main=131)
    
    try:
        # Navigate with human-like delays
        driver.get(url)
        time.sleep(2)  # Wait for page load
        
        # Handle cookie banners
        try:
            accept_buttons = driver.find_elements(By.CSS_SELECTOR, 
                'button[id*="accept"], button[class*="accept"], button[id*="cookie"]')
            if accept_buttons:
                accept_buttons[0].click()
                time.sleep(1)
        except:
            pass
        
        # Wait for content
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )
        
        # Get final URL and HTML
        final_url = driver.current_url
        html_content = driver.page_source
        
        # Save HTML to file
        html_file = f"/tmp/page_{int(time.time())}.html"
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        return {
            "success": True,
            "final_url": final_url,
            "html_file": html_file,
            "status_code": 200
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
    finally:
        driver.quit()
```

**Node.js Integration:**
```javascript
import axios from 'axios';

async function preparePageWithPython(url, device) {
    try {
        const response = await axios.post('http://localhost:8001/scan/prepare', {
            url: url,
            device: device
        });
        
        if (response.data.success) {
            // Load the HTML file and create a Puppeteer page from it
            const htmlContent = await fs.readFile(response.data.html_file, 'utf-8');
            // Or navigate to the final URL with Puppeteer
            return {
                success: true,
                finalUrl: response.data.final_url,
                htmlFile: response.data.html_file
            };
        }
        return { success: false, error: response.data.error };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

---

## Scenario 2: Python Full Replacement

### Architecture:
```
Node.js Backend → Python Service → Python runs Lighthouse (via Chrome DevTools) → Returns JSON
```

### Implementation:
1. **Python** handles everything: navigation, bypass, and Lighthouse
2. **Returns** Lighthouse JSON directly
3. **Node.js** just processes the JSON and generates PDFs

### Pros:
- ✅ Single language for scanning logic
- ✅ Can use Python's Lighthouse wrapper (pylighthouse)
- ✅ Better control over entire process
- ✅ Can use Python-specific optimizations

### Cons:
- ⚠️ Need to rewrite existing Node.js scanning code
- ⚠️ Lighthouse Python bindings may be less mature
- ⚠️ More migration effort

### Code Example:

**Python Service:**
```python
from lighthouse import Lighthouse
from undetected_chromedriver import uc
import json

async def run_full_audit(url: str, device: str):
    # Step 1: Navigate with undetected-chromedriver
    driver = uc.Chrome(headless=True)
    driver.get(url)
    time.sleep(3)
    
    # Step 2: Get Chrome DevTools port
    devtools_port = driver.service.service_url.split(':')[-1].split('/')[0]
    
    # Step 3: Run Lighthouse via Chrome DevTools
    lighthouse = Lighthouse(url, port=devtools_port)
    report = lighthouse.generate_report()
    
    driver.quit()
    
    return json.loads(report)
```

---

## Scenario 3: Hybrid Approach (Best Balance)

### Architecture:
```
Node.js → Python (bypass detection) → Save HTML → Node.js Puppeteer loads HTML → Lighthouse
```

### Implementation:
1. **Python** navigates and bypasses, saves HTML to file
2. **Node.js** loads the HTML file in Puppeteer
3. **Lighthouse** runs on the loaded page

### Pros:
- ✅ Leverages Python's anti-detection
- ✅ Keeps Node.js Lighthouse integration
- ✅ Minimal changes to existing code
- ✅ Can fallback to Node.js if Python fails

### Cons:
- ⚠️ File I/O overhead
- ⚠️ Need to handle HTML file cleanup

### Code Example:

**Python:**
```python
@app.post("/scan/bypass")
async def bypass_and_save(url: str):
    driver = uc.Chrome(headless=True)
    driver.get(url)
    time.sleep(2)
    
    html_file = f"/tmp/scan_{int(time.time())}.html"
    with open(html_file, 'w') as f:
        f.write(driver.page_source)
    
    driver.quit()
    
    return {"html_file": html_file, "final_url": url}
```

**Node.js:**
```javascript
async function auditWithPythonBypass(url, device) {
    // Step 1: Python bypasses detection
    const pythonResult = await axios.post('http://localhost:8001/scan/bypass', { url });
    
    if (!pythonResult.data.html_file) {
        throw new Error('Python bypass failed');
    }
    
    // Step 2: Load HTML in Puppeteer
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(`file://${pythonResult.data.html_file}`);
    
    // Step 3: Run Lighthouse
    const result = await lighthouse(page.url(), {}, customConfig, page);
    
    // Step 4: Cleanup
    await fs.unlink(pythonResult.data.html_file);
    await browser.close();
    
    return result;
}
```

---

## Scenario 4: Python Pre-Check Service

### Architecture:
```
Node.js → Python checks if site is accessible → Returns strategy → Node.js uses appropriate method
```

### Implementation:
1. **Python** quickly tests if site blocks bots
2. **Returns** recommendation: "use-python" or "use-nodejs"
3. **Node.js** routes to appropriate scanner

### Pros:
- ✅ Smart routing based on site behavior
- ✅ Only uses Python when needed
- ✅ Minimal overhead for easy sites

### Cons:
- ⚠️ Adds extra step for every scan
- ⚠️ May add latency

---

## Scenario 5: Python with Cloudscraper (Cloudflare Sites)

### Architecture:
```
Node.js → Python Cloudscraper → Bypasses Cloudflare → Returns HTML → Node.js processes
```

### Implementation:
- Use **cloudscraper** for Cloudflare-protected sites
- Use **undetected-chromedriver** for other sites
- Python service intelligently chooses the right tool

### Code Example:

**Python:**
```python
import cloudscraper
from undetected_chromedriver import uc

async def scan_with_cloudscraper(url: str):
    # Try cloudscraper first (faster for Cloudflare)
    scraper = cloudscraper.create_scraper()
    response = scraper.get(url)
    
    if response.status_code == 200:
        return {
            "success": True,
            "html": response.text,
            "method": "cloudscraper"
        }
    
    # Fallback to undetected-chromedriver
    driver = uc.Chrome(headless=True)
    driver.get(url)
    html = driver.page_source
    driver.quit()
    
    return {
        "success": True,
        "html": html,
        "method": "undetected-chromedriver"
    }
```

---

## Recommended Implementation: Scenario 1 (Python Microservice)

### Step-by-Step Setup:

1. **Create Python Service:**
```bash
# Create new directory
mkdir python-scanner
cd python-scanner

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn undetected-chromedriver selenium cloudscraper
```

2. **Create FastAPI Service:**
```python
# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from scanner import prepare_page_for_lighthouse

app = FastAPI()

class ScanRequest(BaseModel):
    url: str
    device: str = "desktop"

@app.post("/scan/prepare")
async def prepare_scan(request: ScanRequest):
    result = await prepare_page_for_lighthouse(request.url, request.device)
    return result
```

3. **Update Node.js to Call Python:**
```javascript
// In auditService.js
import axios from 'axios';

const PYTHON_SCANNER_URL = process.env.PYTHON_SCANNER_URL || 'http://localhost:8001';

async function preparePageWithPython(url, device) {
    try {
        const response = await axios.post(`${PYTHON_SCANNER_URL}/scan/prepare`, {
            url,
            device
        }, { timeout: 120000 }); // 2 minute timeout
        
        return response.data;
    } catch (error) {
        console.error('Python scanner failed:', error.message);
        return { success: false, error: error.message };
    }
}

// In runQuickScanProcess or runFullAuditProcess:
const pythonResult = await preparePageWithPython(url, device);
if (pythonResult.success) {
    // Use the prepared URL/HTML for Lighthouse
    const auditResult = await runLighthouseAudit({
        url: pythonResult.final_url,
        device,
        format: 'json'
    });
}
```

4. **Docker Setup (Optional):**
```dockerfile
# Dockerfile.python-scanner
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

## Comparison Table

| Scenario | Complexity | Performance | Anti-Detection | Maintenance |
|----------|-----------|-------------|----------------|-------------|
| **1. Microservice** | Medium | High | Excellent | Easy |
| **2. Full Replacement** | High | High | Excellent | Medium |
| **3. Hybrid** | Low | Medium | Good | Easy |
| **4. Pre-Check** | Low | Medium | Good | Easy |
| **5. Cloudscraper** | Low | High | Excellent (CF) | Easy |

---

## Next Steps

1. **Start with Scenario 1 (Microservice)** - Best balance of benefits vs. complexity
2. **Test with problematic sites** - jointcommission.org, etc.
3. **Measure success rates** - Compare Python vs. Node.js
4. **Scale if successful** - Add more Python workers if needed

---

## Python Libraries to Install

```bash
pip install undetected-chromedriver selenium cloudscraper fastapi uvicorn playwright
```

## Environment Variables

Add to `.env`:
```
PYTHON_SCANNER_URL=http://localhost:8001
PYTHON_SCANNER_ENABLED=true
```

---

## Conclusion

**Recommended Approach: Scenario 1 (Python Microservice)**

This gives you:
- ✅ Best anti-detection capabilities
- ✅ Minimal changes to existing code
- ✅ Easy to scale and maintain
- ✅ Can fallback to Node.js if Python fails
- ✅ Can A/B test Python vs. Node.js success rates

The Python service can be deployed as a separate container/service, making it easy to update and scale independently.

