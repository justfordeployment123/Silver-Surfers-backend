"""
Example Python Scanner Service
This demonstrates how to create a Python microservice for better anti-bot detection
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import time
import os
import tempfile
import json

# Try importing anti-detection libraries
try:
    import undetected_chromedriver as uc
    UC_AVAILABLE = True
except ImportError:
    UC_AVAILABLE = False
    print("Warning: undetected-chromedriver not installed")

try:
    import cloudscraper
    CLOUDSCRAPER_AVAILABLE = True
except ImportError:
    CLOUDSCRAPER_AVAILABLE = False
    print("Warning: cloudscraper not installed")

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Warning: playwright not installed")

app = FastAPI(title="Python Scanner Service")

class ScanRequest(BaseModel):
    url: str
    device: str = "desktop"
    method: Optional[str] = "auto"  # auto, undetected-chrome, cloudscraper, playwright

class ScanResponse(BaseModel):
    success: bool
    final_url: Optional[str] = None
    html_file: Optional[str] = None
    method_used: Optional[str] = None
    error: Optional[str] = None
    status_code: Optional[int] = None

def scan_with_undetected_chrome(url: str, device: str) -> ScanResponse:
    """Use undetected-chromedriver for best anti-detection"""
    if not UC_AVAILABLE:
        return ScanResponse(success=False, error="undetected-chromedriver not available")
    
    options = uc.ChromeOptions()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    
    if device == "mobile":
        options.add_argument('--window-size=375,667')
        options.add_argument('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15')
    else:
        options.add_argument('--window-size=1920,1080')
    
    driver = None
    try:
        driver = uc.Chrome(options=options, version_main=131)
        driver.get(url)
        time.sleep(2)  # Wait for page to load
        
        # Handle cookie banners
        try:
            from selenium.webdriver.common.by import By
            accept_selectors = [
                'button[id*="accept"]',
                'button[class*="accept"]',
                'button[id*="cookie"]',
                '#cookie-banner button',
                '.cookie-banner button'
            ]
            for selector in accept_selectors:
                try:
                    button = driver.find_element(By.CSS_SELECTOR, selector)
                    if button.is_displayed():
                        button.click()
                        time.sleep(1)
                        break
                except:
                    continue
        except:
            pass
        
        final_url = driver.current_url
        html_content = driver.page_source
        
        # Save HTML to temporary file
        html_file = tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False)
        html_file.write(html_content)
        html_file_path = html_file.name
        html_file.close()
        
        return ScanResponse(
            success=True,
            final_url=final_url,
            html_file=html_file_path,
            method_used="undetected-chromedriver",
            status_code=200
        )
    except Exception as e:
        return ScanResponse(
            success=False,
            error=str(e),
            method_used="undetected-chromedriver"
        )
    finally:
        if driver:
            driver.quit()

def scan_with_cloudscraper(url: str) -> ScanResponse:
    """Use cloudscraper for Cloudflare-protected sites"""
    if not CLOUDSCRAPER_AVAILABLE:
        return ScanResponse(success=False, error="cloudscraper not available")
    
    try:
        scraper = cloudscraper.create_scraper(
            browser={
                'browser': 'chrome',
                'platform': 'windows',
                'desktop': True
            }
        )
        
        response = scraper.get(url, timeout=30)
        
        if response.status_code == 200:
            html_content = response.text
            
            # Save HTML to temporary file
            html_file = tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False)
            html_file.write(html_content)
            html_file_path = html_file.name
            html_file.close()
            
            return ScanResponse(
                success=True,
                final_url=url,
                html_file=html_file_path,
                method_used="cloudscraper",
                status_code=200
            )
        else:
            return ScanResponse(
                success=False,
                error=f"HTTP {response.status_code}",
                method_used="cloudscraper",
                status_code=response.status_code
            )
    except Exception as e:
        return ScanResponse(
            success=False,
            error=str(e),
            method_used="cloudscraper"
        )

def scan_with_playwright(url: str, device: str) -> ScanResponse:
    """Use Playwright for modern browser automation"""
    if not PLAYWRIGHT_AVAILABLE:
        return ScanResponse(success=False, error="playwright not available")
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                viewport={'width': 1920, 'height': 1080} if device == 'desktop' else {'width': 375, 'height': 667},
                locale='en-US',
                extra_http_headers={
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.google.com/',
                }
            )
            
            page = context.new_page()
            response = page.goto(url, wait_until='networkidle', timeout=60000)
            
            if response and response.status == 403:
                # Wait and check if content loaded
                time.sleep(3)
                content = page.content()
                if len(content) < 1000:
                    browser.close()
                    return ScanResponse(
                        success=False,
                        error="Insufficient content despite 403",
                        method_used="playwright"
                    )
            
            final_url = page.url
            html_content = page.content()
            
            # Save HTML to temporary file
            html_file = tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8')
            html_file.write(html_content)
            html_file_path = html_file.name
            html_file.close()
            
            browser.close()
            
            return ScanResponse(
                success=True,
                final_url=final_url,
                html_file=html_file_path,
                method_used="playwright",
                status_code=response.status if response else 200
            )
    except Exception as e:
        return ScanResponse(
            success=False,
            error=str(e),
            method_used="playwright"
        )

@app.post("/scan/prepare", response_model=ScanResponse)
async def prepare_scan(request: ScanRequest):
    """
    Prepare a page for Lighthouse scanning by bypassing bot detection.
    Returns HTML file path and final URL.
    """
    url = request.url
    device = request.device
    method = request.method
    
    # Auto-detect best method
    if method == "auto":
        # Try methods in order of effectiveness
        methods = []
        if UC_AVAILABLE:
            methods.append(("undetected-chrome", scan_with_undetected_chrome))
        if CLOUDSCRAPER_AVAILABLE:
            methods.append(("cloudscraper", scan_with_cloudscraper))
        if PLAYWRIGHT_AVAILABLE:
            methods.append(("playwright", lambda u, d: scan_with_playwright(u, d)))
        
        # Try each method until one succeeds
        for method_name, method_func in methods:
            try:
                if method_name == "cloudscraper":
                    result = method_func(url)
                else:
                    result = method_func(url, device)
                
                if result.success:
                    return result
            except Exception as e:
                continue
        
        return ScanResponse(
            success=False,
            error="All methods failed"
        )
    
    # Use specific method
    elif method == "undetected-chrome":
        return scan_with_undetected_chrome(url, device)
    elif method == "cloudscraper":
        return scan_with_cloudscraper(url)
    elif method == "playwright":
        return scan_with_playwright(url, device)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown method: {method}")

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "undetected_chrome": UC_AVAILABLE,
        "cloudscraper": CLOUDSCRAPER_AVAILABLE,
        "playwright": PLAYWRIGHT_AVAILABLE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

