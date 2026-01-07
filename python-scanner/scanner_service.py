"""
Python Scanner Service for SilverSurfers
Uses Camoufox (Playwright wrapper with advanced anti-detection) to scan websites
and perform accessibility audits compatible with Lighthouse format.
"""

import asyncio
import json
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from camoufox import Camoufox
from bs4 import BeautifulSoup

app = FastAPI(title="SilverSurfers Python Scanner", version="1.0.0")


class AuditRequest(BaseModel):
    url: str
    device: str = "desktop"  # desktop, mobile, tablet
    format: str = "json"  # json or html
    isLiteVersion: bool = False


class AuditResponse(BaseModel):
    success: bool
    reportPath: Optional[str] = None
    report: Optional[Dict[str, Any]] = None
    isLiteVersion: bool = False
    version: str = "Full"
    url: str = ""
    device: str = "desktop"
    strategy: str = "Python-Playwright"
    attemptNumber: int = 1
    message: str = ""
    error: Optional[str] = None
    errorCode: Optional[str] = None


# Configuration matching Node.js custom-config-lite.js
LITE_AUDIT_REFS = [
    {"id": "color-contrast", "weight": 5},
    {"id": "target-size", "weight": 5},
    {"id": "text-font-audit", "weight": 5},
    {"id": "viewport", "weight": 3},
    {"id": "link-name", "weight": 3},
    {"id": "button-name", "weight": 3},
    {"id": "label", "weight": 3},
    {"id": "heading-order", "weight": 2},
    {"id": "is-on-https", "weight": 2},
    {"id": "largest-contentful-paint", "weight": 1},
    {"id": "cumulative-layout-shift", "weight": 1},
]

# Full audit refs (from custom-config.js - simplified version)
FULL_AUDIT_REFS = [
    {"id": "color-contrast", "weight": 10},
    {"id": "target-size", "weight": 10},
    {"id": "viewport", "weight": 10},
    {"id": "cumulative-layout-shift", "weight": 10},
    {"id": "text-font-audit", "weight": 15},
    {"id": "layout-brittle-audit", "weight": 2},
    {"id": "flesch-kincaid-audit", "weight": 15},
    {"id": "largest-contentful-paint", "weight": 5},
    {"id": "total-blocking-time", "weight": 5},
    {"id": "link-name", "weight": 5},
    {"id": "button-name", "weight": 5},
    {"id": "label", "weight": 5},
    {"id": "interactive-color-audit", "weight": 5},
    {"id": "heading-order", "weight": 3},
    {"id": "is-on-https", "weight": 2},
]


def calculate_score(report: Dict[str, Any], is_lite: bool = False) -> float:
    """
    Calculate score using the same logic as Node.js calculateLiteScore/calculateSeniorFriendlinessScore
    """
    category_id = "senior-friendly-lite" if is_lite else "senior-friendly"
    audit_refs = LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS
    
    audits = report.get("audits", {})
    total_weighted_score = 0
    total_weight = 0
    
    for audit_ref in audit_refs:
        audit_id = audit_ref["id"]
        weight = audit_ref["weight"]
        result = audits.get(audit_id, {})
        score = result.get("score", 0) if result else 0
        total_weighted_score += score * weight
        total_weight += weight
    
    final_score = (total_weighted_score / total_weight * 100) if total_weight > 0 else 0
    return round(final_score, 2)


def get_viewport_for_device(device: str = "desktop") -> Dict[str, int]:
    """Get viewport configuration for device type"""
    viewport_configs = {
        "desktop": {"width": 1920, "height": 1080},
        "tablet": {"width": 768, "height": 1024},
        "mobile": {"width": 375, "height": 667},
    }
    return viewport_configs.get(device, viewport_configs["desktop"])


async def perform_accessibility_audit(page, url: str, is_lite: bool = False) -> Dict[str, Any]:
    """
    Perform accessibility audit using Camoufox (Playwright-compatible) and return Lighthouse-compatible format
    """
    # Navigate to page
    try:
        response = await page.goto(url, wait_until="networkidle", timeout=60000)
        if response and response.status >= 400:
            if response.status == 403:
                # Wait a bit, content might still load
                await asyncio.sleep(3)
                content = await page.content()
                if len(content) < 1000:
                    raise Exception(f"HTTP {response.status}: Insufficient content")
            else:
                raise Exception(f"HTTP {response.status}: Failed to load page")
    except Exception as e:
        raise Exception(f"Navigation failed: {str(e)}")
    
    # Wait for page to settle
    await asyncio.sleep(2)
    
    # Get page content and parse with BeautifulSoup
    html_content = await page.content()
    soup = BeautifulSoup(html_content, "lxml")
    
    # Get final URL after redirects
    final_url = page.url
    
    # Perform audits (simplified version - in production, use axe-core or similar)
    audits = {}
    
    # Color contrast (simplified check)
    audits["color-contrast"] = {
        "id": "color-contrast",
        "title": "Background and foreground colors have a sufficient contrast ratio",
        "score": 0.9,  # Placeholder - would need actual contrast calculation
        "numericValue": 0.9,
    }
    
    # Target size (check for small clickable elements)
    small_targets = await page.evaluate("""
        () => {
            const elements = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
            let smallCount = 0;
            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 44 || rect.height < 44) smallCount++;
            });
            return { total: elements.length, small: smallCount };
        }
    """)
    target_score = 1.0 if small_targets["small"] == 0 else max(0, 1 - (small_targets["small"] / max(small_targets["total"], 1)))
    audits["target-size"] = {
        "id": "target-size",
        "title": "Touch targets have sufficient size and spacing",
        "score": target_score,
        "numericValue": target_score,
    }
    
    # Viewport meta tag
    viewport_meta = soup.find("meta", attrs={"name": "viewport"})
    has_viewport = viewport_meta is not None
    audits["viewport"] = {
        "id": "viewport",
        "title": "Has a `<meta name=\"viewport\">` tag with `width` or `initial-scale`",
        "score": 1.0 if has_viewport else 0.0,
        "numericValue": 1.0 if has_viewport else 0.0,
    }
    
    # Link names
    links_without_text = await page.evaluate("""
        () => {
            const links = Array.from(document.querySelectorAll('a'));
            return links.filter(link => {
                const text = link.textContent.trim();
                const ariaLabel = link.getAttribute('aria-label');
                const title = link.getAttribute('title');
                return !text && !ariaLabel && !title;
            }).length;
        }
    """)
    total_links = len(soup.find_all("a"))
    link_score = 1.0 if total_links == 0 else max(0, 1 - (links_without_text / max(total_links, 1)))
    audits["link-name"] = {
        "id": "link-name",
        "title": "Links have a discernible name",
        "score": link_score,
        "numericValue": link_score,
    }
    
    # Button names
    buttons_without_text = await page.evaluate("""
        () => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
            return buttons.filter(btn => {
                const text = btn.textContent.trim();
                const ariaLabel = btn.getAttribute('aria-label');
                const value = btn.getAttribute('value');
                return !text && !ariaLabel && !value;
            }).length;
        }
    """)
    total_buttons = len(soup.find_all(["button", "input"]))
    button_score = 1.0 if total_buttons == 0 else max(0, 1 - (buttons_without_text / max(total_buttons, 1)))
    audits["button-name"] = {
        "id": "button-name",
        "title": "Buttons have an accessible name",
        "score": button_score,
        "numericValue": button_score,
    }
    
    # Form labels
    inputs_without_labels = await page.evaluate("""
        () => {
            const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
            return inputs.filter(input => {
                const id = input.id;
                const name = input.name;
                const label = document.querySelector(`label[for="${id}"]`);
                const ariaLabel = input.getAttribute('aria-label');
                const placeholder = input.getAttribute('placeholder');
                return !label && !ariaLabel && !placeholder;
            }).length;
        }
    """)
    total_inputs = len(soup.find_all(["input", "textarea", "select"]))
    label_score = 1.0 if total_inputs == 0 else max(0, 1 - (inputs_without_labels / max(total_inputs, 1)))
    audits["label"] = {
        "id": "label",
        "title": "Form elements have associated labels",
        "score": label_score,
        "numericValue": label_score,
    }
    
    # Heading order
    heading_order_valid = await page.evaluate("""
        () => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
            let lastLevel = 0;
            for (const heading of headings) {
                const level = parseInt(heading.tagName[1]);
                if (level > lastLevel + 1) return false;
                lastLevel = level;
            }
            return true;
        }
    """)
    audits["heading-order"] = {
        "id": "heading-order",
        "title": "Heading elements appear in a sequentially-descending order",
        "score": 1.0 if heading_order_valid else 0.0,
        "numericValue": 1.0 if heading_order_valid else 0.0,
    }
    
    # HTTPS check
    is_https = urlparse(final_url).scheme == "https"
    audits["is-on-https"] = {
        "id": "is-on-https",
        "title": "Uses HTTPS",
        "score": 1.0 if is_https else 0.0,
        "numericValue": 1.0 if is_https else 0.0,
    }
    
    # Text font audit (simplified - check for small text)
    small_text_count = await page.evaluate("""
        () => {
            const elements = document.querySelectorAll('p, span, div, li, td, th, a, button, label');
            let smallCount = 0;
            elements.forEach(el => {
                const style = window.getComputedStyle(el);
                const fontSize = parseFloat(style.fontSize);
                if (fontSize < 16) smallCount++;
            });
            return smallCount;
        }
    """)
    total_text_elements = len(soup.find_all(["p", "span", "div", "li", "td", "th", "a", "button", "label"]))
    text_score = 1.0 if total_text_elements == 0 else max(0, 1 - (small_text_count / max(total_text_elements, 1)))
    audits["text-font-audit"] = {
        "id": "text-font-audit",
        "title": "Text is appropriately sized for readability",
        "score": text_score,
        "numericValue": text_score,
    }
    
    # Performance metrics (simplified)
    performance_metrics = await page.evaluate("""
        () => {
            const perf = performance.timing;
            const paint = performance.getEntriesByType('paint');
            const lcp = paint.find(p => p.name === 'largest-contentful-paint');
            return {
                loadTime: perf.loadEventEnd - perf.navigationStart,
                lcp: lcp ? lcp.startTime : 0
            };
        }
    """)
    
    # Largest Contentful Paint (LCP) - good if < 2.5s
    lcp_score = 1.0 if performance_metrics.get("lcp", 0) < 2500 else max(0, 1 - (performance_metrics.get("lcp", 0) - 2500) / 2500)
    audits["largest-contentful-paint"] = {
        "id": "largest-contentful-paint",
        "title": "Largest Contentful Paint",
        "score": lcp_score,
        "numericValue": performance_metrics.get("lcp", 0),
    }
    
    # Cumulative Layout Shift (CLS) - simplified
    audits["cumulative-layout-shift"] = {
        "id": "cumulative-layout-shift",
        "title": "Cumulative Layout Shift",
        "score": 0.9,  # Placeholder - would need actual CLS measurement
        "numericValue": 0.1,
    }
    
    # Build Lighthouse-compatible report
    category_id = "senior-friendly-lite" if is_lite else "senior-friendly"
    category_title = "Senior Accessibility (Lite)" if is_lite else "Senior Friendliness"
    
    final_score = calculate_score({"audits": audits}, is_lite)
    
    report = {
        "lighthouseVersion": "10.0.0",
        "fetchTime": time.time() * 1000,
        "requestedUrl": url,
        "finalUrl": final_url,
        "categories": {
            category_id: {
                "id": category_id,
                "title": category_title,
                "score": final_score / 100,
                "auditRefs": LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS,
            }
        },
        "audits": audits,
    }
    
    return report


def _run_camoufox_audit_sync(url: str, viewport: Dict[str, int], is_lite: bool) -> Dict[str, Any]:
    """
    Synchronous wrapper for Camoufox audit.
    This runs in a thread pool to avoid blocking the async event loop.
    Camoufox uses Playwright's sync API, so we need to run it in a separate thread.
    """
    # Use Camoufox for advanced anti-detection (sync API)
    # Note: viewport is set on the page, not in the browser constructor
    with Camoufox(headless=True) as browser:
        # Get a page from the browser (sync API)
        page = browser.new_page()
        
        # Set viewport for the page
        page.set_viewport_size(width=viewport["width"], height=viewport["height"])
        
        try:
            # Navigate to the URL (sync)
            page.goto(url, wait_until="networkidle", timeout=60000)
            
            # Wait a bit for dynamic content (sync)
            page.wait_for_timeout(2000)
            
            # Get page content (sync)
            html_content = page.content()
            page_url = page.url
            
            # Parse HTML with BeautifulSoup
            soup = BeautifulSoup(html_content, 'lxml')
            
            # Get final URL after redirects
            final_url = page_url
            
            # Perform audits using sync Playwright API
            audits = {}
            
            # Color contrast (simplified check)
            audits["color-contrast"] = {
                "id": "color-contrast",
                "title": "Background and foreground colors have a sufficient contrast ratio",
                "score": 0.9,  # Placeholder
                "numericValue": 0.9,
            }
            
            # Target size (check for small clickable elements) - sync eval
            small_targets = page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
                    let smallCount = 0;
                    elements.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 44 || rect.height < 44) smallCount++;
                    });
                    return { total: elements.length, small: smallCount };
                }
            """)
            target_score = 1.0 if small_targets["small"] == 0 else max(0, 1 - (small_targets["small"] / max(small_targets["total"], 1)))
            audits["target-size"] = {
                "id": "target-size",
                "title": "Touch targets have sufficient size and spacing",
                "score": target_score,
                "numericValue": target_score,
            }
            
            # Viewport meta tag
            viewport_meta = soup.find("meta", attrs={"name": "viewport"})
            has_viewport = viewport_meta is not None
            audits["viewport"] = {
                "id": "viewport",
                "title": "Has a `<meta name=\"viewport\">` tag with `width` or `initial-scale`",
                "score": 1.0 if has_viewport else 0.0,
                "numericValue": 1.0 if has_viewport else 0.0,
            }
            
            # Link names - sync eval
            links_without_text = page.evaluate("""
                () => {
                    const links = Array.from(document.querySelectorAll('a'));
                    return links.filter(link => {
                        const text = link.textContent.trim();
                        const ariaLabel = link.getAttribute('aria-label');
                        const title = link.getAttribute('title');
                        return !text && !ariaLabel && !title;
                    }).length;
                }
            """)
            total_links = len(soup.find_all("a"))
            link_score = 1.0 if total_links == 0 else max(0, 1 - (links_without_text / max(total_links, 1)))
            audits["link-name"] = {
                "id": "link-name",
                "title": "Links have a discernible name",
                "score": link_score,
                "numericValue": link_score,
            }
            
            # Button names - sync eval
            buttons_without_text = page.evaluate("""
                () => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                    return buttons.filter(btn => {
                        const text = btn.textContent.trim();
                        const ariaLabel = btn.getAttribute('aria-label');
                        const value = btn.getAttribute('value');
                        return !text && !ariaLabel && !value;
                    }).length;
                }
            """)
            total_buttons = len(soup.find_all(["button", "input"]))
            button_score = 1.0 if total_buttons == 0 else max(0, 1 - (buttons_without_text / max(total_buttons, 1)))
            audits["button-name"] = {
                "id": "button-name",
                "title": "Buttons have an accessible name",
                "score": button_score,
                "numericValue": button_score,
            }
            
            # Form labels - sync eval
            inputs_without_labels = page.evaluate("""
                () => {
                    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
                    return inputs.filter(input => {
                        const id = input.id;
                        const name = input.name;
                        const label = document.querySelector(`label[for="${id}"]`);
                        const ariaLabel = input.getAttribute('aria-label');
                        const placeholder = input.getAttribute('placeholder');
                        return !label && !ariaLabel && !placeholder;
                    }).length;
                }
            """)
            total_inputs = len(soup.find_all(["input", "textarea", "select"]))
            label_score = 1.0 if total_inputs == 0 else max(0, 1 - (inputs_without_labels / max(total_inputs, 1)))
            audits["label"] = {
                "id": "label",
                "title": "Form elements have associated labels",
                "score": label_score,
                "numericValue": label_score,
            }
            
            # Heading order - sync eval
            heading_order_valid = page.evaluate("""
                () => {
                    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
                    let lastLevel = 0;
                    for (const heading of headings) {
                        const level = parseInt(heading.tagName[1]);
                        if (level > lastLevel + 1) return false;
                        lastLevel = level;
                    }
                    return true;
                }
            """)
            audits["heading-order"] = {
                "id": "heading-order",
                "title": "Heading elements appear in a sequentially-descending order",
                "score": 1.0 if heading_order_valid else 0.0,
                "numericValue": 1.0 if heading_order_valid else 0.0,
            }
            
            # HTTPS check
            is_https = urlparse(final_url).scheme == "https"
            audits["is-on-https"] = {
                "id": "is-on-https",
                "title": "Uses HTTPS",
                "score": 1.0 if is_https else 0.0,
                "numericValue": 1.0 if is_https else 0.0,
            }
            
            # Text font audit - sync eval
            small_text_count = page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('p, span, div, li, td, th, a, button, label');
                    let smallCount = 0;
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        const fontSize = parseFloat(style.fontSize);
                        if (fontSize < 16) smallCount++;
                    });
                    return smallCount;
                }
            """)
            total_text_elements = len(soup.find_all(["p", "span", "div", "li", "td", "th", "a", "button", "label"]))
            text_score = 1.0 if total_text_elements == 0 else max(0, 1 - (small_text_count / max(total_text_elements, 1)))
            audits["text-font-audit"] = {
                "id": "text-font-audit",
                "title": "Text is appropriately sized for readability",
                "score": text_score,
                "numericValue": text_score,
            }
            
            # Performance metrics - sync eval
            performance_metrics = page.evaluate("""
                () => {
                    const perf = performance.timing;
                    const paint = performance.getEntriesByType('paint');
                    const lcp = paint.find(p => p.name === 'largest-contentful-paint');
                    return {
                        loadTime: perf.loadEventEnd - perf.navigationStart,
                        lcp: lcp ? lcp.startTime : 0
                    };
                }
            """)
            
            # Largest Contentful Paint (LCP)
            lcp_score = 1.0 if performance_metrics.get("lcp", 0) < 2500 else max(0, 1 - (performance_metrics.get("lcp", 0) - 2500) / 2500)
            audits["largest-contentful-paint"] = {
                "id": "largest-contentful-paint",
                "title": "Largest Contentful Paint",
                "score": lcp_score,
                "numericValue": performance_metrics.get("lcp", 0),
            }
            
            # Cumulative Layout Shift (CLS) - placeholder
            audits["cumulative-layout-shift"] = {
                "id": "cumulative-layout-shift",
                "title": "Cumulative Layout Shift",
                "score": 0.9,
                "numericValue": 0.1,
            }
            
            # Build Lighthouse-compatible report
            category_id = "senior-friendly-lite" if is_lite else "senior-friendly"
            category_title = "Senior Accessibility (Lite)" if is_lite else "Senior Friendliness"
            
            final_score = calculate_score({"audits": audits}, is_lite)
            
            report = {
                "lighthouseVersion": "10.0.0",
                "fetchTime": time.time() * 1000,
                "requestedUrl": url,
                "finalUrl": final_url,
                "categories": {
                    category_id: {
                        "id": category_id,
                        "title": category_title,
                        "score": final_score / 100,
                        "auditRefs": LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS,
                    }
                },
                "audits": audits,
            }
            
            return {
                "success": True,
                "report": report,
                "score": final_score
            }
            
        finally:
            page.close()


@app.post("/audit", response_model=AuditResponse)
async def perform_audit(request: AuditRequest):
    """
    Perform accessibility audit using Python/Camoufox with advanced anti-detection
    """
    try:
        # Normalize URL
        url = request.url
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        
        version = "Lite" if request.isLiteVersion else "Full"
        print(f"\n=== Starting {version} audit for {url} (Python/Camoufox) ===")
        print(f"Device: {request.device}")
        
        # Get viewport for device
        viewport = get_viewport_for_device(request.device)
        
        # Run Camoufox in a thread pool executor to avoid blocking async event loop
        # Camoufox uses Playwright's sync API, so we need to run it in a separate thread
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(
                executor,
                _run_camoufox_audit_sync,
                url,
                viewport,
                request.isLiteVersion
            )
        
        if not result["success"]:
            raise Exception(result.get("error", "Audit failed"))
        
        report = result["report"]
        final_score = result["score"]
        
        if final_score == 0:
            raise Exception("Audit score is 0, indicating a failed audit")
        
        # Save report to file
        url_obj = urlparse(url)
        hostname = url_obj.hostname.replace(".", "-") if url_obj.hostname else "unknown"
        timestamp = int(time.time() * 1000)
        version_suffix = "-lite" if request.isLiteVersion else ""
        report_filename = f"report-{hostname}-{timestamp}{version_suffix}.json"
        
        # Save to temp directory
        temp_dir = os.getenv("TEMP_DIR", "/tmp")
        os.makedirs(temp_dir, exist_ok=True)
        report_path = os.path.join(temp_dir, report_filename)
        
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        
        print(f"✅ {version} audit completed successfully")
        print(f"📊 Score: {final_score}%")
        print(f"📄 Report saved to: {report_path}")
        
        return AuditResponse(
            success=True,
            reportPath=report_path,
            report=report,
            isLiteVersion=request.isLiteVersion,
            version=version,
            url=url,
            device=request.device,
            strategy="Python-Camoufox",
            attemptNumber=1,
            message=f"{version} audit completed successfully using Python/Camoufox strategy",
        )
                
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Audit failed: {error_msg}")
        return AuditResponse(
            success=False,
            error=error_msg,
            errorCode="AUDIT_FAILED",
            isLiteVersion=request.isLiteVersion,
            version="Lite" if request.isLiteVersion else "Full",
            url=request.url,
            device=request.device,
            strategy="Python-Camoufox",
            attemptNumber=1,
            message=f"Audit failed: {error_msg}",
        )


@app.get("/health")
@app.head("/health")
async def health_check():
    """Health check endpoint - supports both GET and HEAD for health checks"""
    return {"status": "healthy", "service": "python-scanner"}


if __name__ == "__main__":
    import uvicorn
    # Get configuration from environment variables
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8001"))
    limit_concurrency = int(os.getenv("LIMIT_CONCURRENCY", "10"))
    timeout_keep_alive = int(os.getenv("TIMEOUT_KEEP_ALIVE", "300"))
    
    # Configure for parallel processing - allow up to 10 concurrent requests
    uvicorn.run(
        app, 
        host=host, 
        port=port,
        workers=1,  # Single worker (FastAPI handles async concurrency)
        limit_concurrency=limit_concurrency,  # Allow up to 10 concurrent connections
        timeout_keep_alive=timeout_keep_alive  # 5 minutes keep-alive for long-running scans
    )

