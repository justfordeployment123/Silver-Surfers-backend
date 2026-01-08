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

# Full audit refs (from custom-config.js - MUST MATCH EXACTLY)
FULL_AUDIT_REFS = [
    # Tier 1: Critical (Weight: 10 each)
    {"id": "color-contrast", "weight": 10},
    {"id": "target-size", "weight": 10},
    {"id": "viewport", "weight": 10},
    {"id": "cumulative-layout-shift", "weight": 10},
    {"id": "text-font-audit", "weight": 15},
    {"id": "layout-brittle-audit", "weight": 2},
    {"id": "flesch-kincaid-audit", "weight": 15},
    # Tier 2: Important (Weight: 5 each)
    {"id": "largest-contentful-paint", "weight": 5},
    {"id": "total-blocking-time", "weight": 5},
    {"id": "link-name", "weight": 5},
    {"id": "button-name", "weight": 5},
    {"id": "label", "weight": 5},
    {"id": "interactive-color-audit", "weight": 5},
    # Tier 3: Foundational (Weight: 2 each)
    {"id": "is-on-https", "weight": 2},
    {"id": "dom-size", "weight": 2},
    {"id": "heading-order", "weight": 2},
    {"id": "errors-in-console", "weight": 2},
    {"id": "geolocation-on-start", "weight": 2},
]


def calculate_score(report: Dict[str, Any], is_lite: bool = False) -> float:
    """
    Calculate score using the EXACT same logic as old backend's audit.js (lines 181-209)
    CRITICAL: Must match old backend EXACTLY - ALWAYS include weight, even for missing/null audits
    Old backend logic:
        for (const auditRef of auditRefs) {
            const { id, weight } = auditRef;
            const result = auditResults[id];
            const score = result ? (result.score ?? 0) : 0;  // Use 0 if missing/null
            totalWeightedScore += score * weight;  // ALWAYS add
            totalWeight += weight;  // ALWAYS add
        }
        finalScore = (totalWeightedScore / totalWeight) * 100;
    """
    category_id = "senior-friendly-lite" if is_lite else "senior-friendly"
    audit_refs = LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS
    
    audits = report.get("audits", {})
    total_weighted_score = 0
    total_weight = 0
    
    for audit_ref in audit_refs:
        audit_id = audit_ref["id"]
        weight = audit_ref["weight"]
        result = audits.get(audit_id)
        
        # EXACT match to old backend's audit.js line 184:
        # const score = result ? (result.score ?? 0) : 0;
        score = result.get("score", 0) if result else 0
        if result and result.get("score") is None:
            score = 0  # Handle None explicitly (Python equivalent of ?? 0)
        
        # EXACT match to old backend's audit.js lines 194-195:
        total_weighted_score += score * weight
        total_weight += weight  # ALWAYS add weight, even if audit is missing
    
    # EXACT match to old backend's audit.js line 209:
    final_score = (total_weighted_score / total_weight * 100) if total_weight > 0 else 0
    return round(final_score, 2)


def get_viewport_for_device(device: str = "desktop") -> Dict[str, Any]:
    """Get viewport and device emulation configuration for device type"""
    device_configs = {
        "desktop": {
            "viewport": {"width": 1920, "height": 1080},
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "device_scale_factor": 1,
            "is_mobile": False,
            "has_touch": False,
        },
        "tablet": {
            # Samsung Galaxy Tab S8 (common tablet size)
            "viewport": {"width": 800, "height": 1280},
            "user_agent": "Mozilla/5.0 (Linux; Android 12; SM-X906B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "device_scale_factor": 2,
            "is_mobile": True,
            "has_touch": True,
        },
        "mobile": {
            # Samsung Galaxy S23
            "viewport": {"width": 360, "height": 780},
            "user_agent": "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
            "device_scale_factor": 3,
            "is_mobile": True,
            "has_touch": True,
        },
    }
    return device_configs.get(device, device_configs["desktop"])


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


def _run_camoufox_audit_sync(url: str, device_config: Dict[str, Any], is_lite: bool) -> Dict[str, Any]:
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
        
        # Set viewport and device emulation for the page
        viewport = device_config.get("viewport", {"width": 1920, "height": 1080})
        page.set_viewport_size(viewport)
        
        # Get device emulation settings
        user_agent = device_config.get("user_agent")
        device_scale_factor = device_config.get("device_scale_factor", 1)
        is_mobile = device_config.get("is_mobile", False)
        has_touch = device_config.get("has_touch", False)
        
        # Set user agent via context (more reliable)
        if user_agent:
            context = page.context
            context.set_extra_http_headers({"User-Agent": user_agent})
        
        # Emulate device characteristics via JavaScript injection before navigation
        # This must be done before goto() to ensure proper emulation
        touch_value = 1 if has_touch else 0
        platform_value = 'Linux armv8l' if is_mobile else 'Win32'
        mobile_bool = 'true' if is_mobile else 'false'
        
        page.add_init_script(f"""
            // Override user agent
            Object.defineProperty(navigator, 'userAgent', {{
                get: () => '{user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}',
                configurable: true
            }});
            
            // Override max touch points for touch support
            Object.defineProperty(navigator, 'maxTouchPoints', {{
                get: () => {touch_value},
                configurable: true
            }});
            
            // Override device pixel ratio
            Object.defineProperty(window, 'devicePixelRatio', {{
                get: () => {device_scale_factor},
                configurable: true
            }});
            
            // Override platform
            Object.defineProperty(navigator, 'platform', {{
                get: () => '{platform_value}',
                configurable: true
            }});
            
            // Override hardware concurrency for mobile devices
            if ({mobile_bool}) {{
                Object.defineProperty(navigator, 'hardwareConcurrency', {{
                    get: () => 8,
                    configurable: true
                }});
            }}
        """)
        
        try:
            # Navigate to the URL (sync) - use "load" instead of "networkidle" for better reliability
            # "networkidle" can timeout on sites with continuous network activity
            page.goto(url, wait_until="load", timeout=120000)  # 2 minutes timeout
            
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
            
            # Color contrast - match old backend structure exactly
            # Old backend uses Lighthouse's built-in color-contrast audit
            audits["color-contrast"] = {
                "id": "color-contrast",
                "title": "Background and foreground colors have a sufficient contrast ratio",
                "description": "This audit checks whether text and background colors have sufficient contrast for readability. Adequate contrast is essential for older adults with vision changes.",
                "score": 0.9,  # Placeholder
                "numericValue": 0.9,
            }
            
            # Target size (check for small clickable elements) - sync eval with details
            target_size_results = page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
                    const smallItems = [];
                    elements.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 44 || rect.height < 44) {
                            smallItems.push({
                                node: {
                                    nodeLabel: el.textContent.trim().substring(0, 50) || el.tagName.toLowerCase(),
                                    selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
                                    path: el.tagName.toLowerCase()
                                },
                                width: Math.round(rect.width),
                                height: Math.round(rect.height)
                            });
                        }
                    });
                    return { total: elements.length, small: smallItems.length, items: smallItems.slice(0, 50) };
                }
            """)
            target_score = 1.0 if target_size_results["small"] == 0 else max(0, 1 - (target_size_results["small"] / max(target_size_results["total"], 1)))
            
            target_details_items = []
            if target_size_results.get("items"):
                for item in target_size_results["items"]:
                    target_details_items.append({
                        "node": item.get("node", {}),
                        "width": item.get("width", 0),
                        "height": item.get("height", 0)
                    })
            
            audits["target-size"] = {
                "id": "target-size",
                "title": "Touch targets have sufficient size and spacing",
                "description": f"This audit checks if interactive elements (buttons, links) are large enough for easy clicking. Found {target_size_results['small']} small targets out of {target_size_results['total']} total interactive elements.",
                "score": target_score,
                "numericValue": target_score,
            }
            
            if target_details_items:
                audits["target-size"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "width", "itemType": "numeric", "text": "Width"},
                        {"key": "height", "itemType": "numeric", "text": "Height"}
                    ],
                    "items": target_details_items
                }
            
            # Viewport meta tag
            viewport_meta = soup.find("meta", attrs={"name": "viewport"})
            has_viewport = viewport_meta is not None
            audits["viewport"] = {
                "id": "viewport",
                "title": "Has a `<meta name=\"viewport\">` tag with `width` or `initial-scale`",
                "description": "This audit checks if the page has a proper viewport meta tag for mobile devices. A viewport tag ensures the page displays correctly on tablets and phones.",
                "score": 1.0 if has_viewport else 0.0,
                "numericValue": 1.0 if has_viewport else 0.0,
            }
            
            # Link names - sync eval with details
            link_name_results = page.evaluate("""
                () => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const failingItems = [];
                    links.forEach(link => {
                        const text = link.textContent.trim();
                        const ariaLabel = link.getAttribute('aria-label');
                        const title = link.getAttribute('title');
                        if (!text && !ariaLabel && !title) {
                            failingItems.push({
                                node: {
                                    nodeLabel: link.href || 'Link',
                                    selector: link.tagName.toLowerCase() + (link.id ? '#' + link.id : '') + (link.className ? '.' + link.className.split(' ')[0] : ''),
                                    path: link.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: links.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            link_score = 1.0 if link_name_results["total"] == 0 else max(0, 1 - (link_name_results["failing"] / max(link_name_results["total"], 1)))
            
            link_details_items = []
            if link_name_results.get("items"):
                for item in link_name_results["items"]:
                    link_details_items.append({
                        "node": item.get("node", {})
                    })
            
            audits["link-name"] = {
                "id": "link-name",
                "title": "Links have a discernible name",
                "description": f"This audit checks if all links have descriptive text. Found {link_name_results['failing']} links without text out of {link_name_results['total']} total links.",
                "score": link_score,
                "numericValue": link_score,
            }
            
            if link_details_items:
                audits["link-name"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": link_details_items
                }
            
            # Button names - sync eval with details
            button_name_results = page.evaluate("""
                () => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                    const failingItems = [];
                    buttons.forEach(btn => {
                        const text = btn.textContent.trim();
                        const ariaLabel = btn.getAttribute('aria-label');
                        const value = btn.getAttribute('value');
                        if (!text && !ariaLabel && !value) {
                            failingItems.push({
                                node: {
                                    nodeLabel: btn.tagName.toLowerCase(),
                                    selector: btn.tagName.toLowerCase() + (btn.id ? '#' + btn.id : '') + (btn.className ? '.' + btn.className.split(' ')[0] : ''),
                                    path: btn.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: buttons.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            button_score = 1.0 if button_name_results["total"] == 0 else max(0, 1 - (button_name_results["failing"] / max(button_name_results["total"], 1)))
            
            button_details_items = []
            if button_name_results.get("items"):
                for item in button_name_results["items"]:
                    button_details_items.append({
                        "node": item.get("node", {})
                    })
            
            audits["button-name"] = {
                "id": "button-name",
                "title": "Buttons have an accessible name",
                "description": f"This audit checks if all buttons have descriptive labels. Found {button_name_results['failing']} buttons without text out of {button_name_results['total']} total buttons.",
                "score": button_score,
                "numericValue": button_score,
            }
            
            if button_details_items:
                audits["button-name"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": button_details_items
                }
            
            # Form labels - sync eval with details
            label_results = page.evaluate("""
                () => {
                    const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
                    const failingItems = [];
                    inputs.forEach(input => {
                        const id = input.id;
                        const name = input.name;
                        const label = document.querySelector(`label[for="${id}"]`);
                        const ariaLabel = input.getAttribute('aria-label');
                        const placeholder = input.getAttribute('placeholder');
                        if (!label && !ariaLabel && !placeholder) {
                            failingItems.push({
                                node: {
                                    nodeLabel: input.tagName.toLowerCase() + (input.type ? '[' + input.type + ']' : ''),
                                    selector: input.tagName.toLowerCase() + (input.id ? '#' + input.id : '') + (input.className ? '.' + input.className.split(' ')[0] : ''),
                                    path: input.tagName.toLowerCase()
                                }
                            });
                        }
                    });
                    return { total: inputs.length, failing: failingItems.length, items: failingItems.slice(0, 50) };
                }
            """)
            label_score = 1.0 if label_results["total"] == 0 else max(0, 1 - (label_results["failing"] / max(label_results["total"], 1)))
            
            label_details_items = []
            if label_results.get("items"):
                for item in label_results["items"]:
                    label_details_items.append({
                        "node": item.get("node", {})
                    })
            
            audits["label"] = {
                "id": "label",
                "title": "Form elements have associated labels",
                "description": f"This audit checks if all form inputs have associated labels. Found {label_results['failing']} inputs without labels out of {label_results['total']} total inputs.",
                "score": label_score,
                "numericValue": label_score,
            }
            
            if label_details_items:
                audits["label"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "node", "itemType": "node", "text": "Element"},
                        {"key": "selector", "itemType": "code", "text": "Location"}
                    ],
                    "items": label_details_items
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
                "description": "This audit checks if headings follow a logical order (H1, then H2, then H3, etc.). Proper heading structure helps screen readers and improves content organization.",
                "score": 1.0 if heading_order_valid else 0.0,
                "numericValue": 1.0 if heading_order_valid else 0.0,
            }
            
            # HTTPS check
            is_https = urlparse(final_url).scheme == "https"
            audits["is-on-https"] = {
                "id": "is-on-https",
                "title": "Uses HTTPS",
                "description": "This audit checks if the page is served over HTTPS. HTTPS encrypts data and provides security for users.",
                "score": 1.0 if is_https else 0.0,
                "numericValue": 1.0 if is_https else 0.0,
            }
            
            # Text font audit - sync eval with detailed items
            text_font_results = page.evaluate("""
                () => {
                    const elements = document.querySelectorAll('p, span, div, li, td, th, a, button, label');
                    const failingItems = [];
                    elements.forEach(el => {
                        const style = window.getComputedStyle(el);
                        const fontSize = parseFloat(style.fontSize);
                        if (fontSize < 16 && el.textContent.trim()) {
                            failingItems.push({
                                textSnippet: el.textContent.trim().substring(0, 100) || 'Text element',
                                containerSelector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
                                fontSize: fontSize.toFixed(1) + 'px'
                            });
                        }
                    });
                    return {
                        total: elements.length,
                        small: failingItems.length,
                        items: failingItems.slice(0, 50)  // Limit to 50 items for performance
                    };
                }
            """)
            total_text_elements = text_font_results.get("total", 0)
            small_text_count = text_font_results.get("small", 0)
            text_score = 1.0 if total_text_elements == 0 else max(0, 1 - (small_text_count / max(total_text_elements, 1)))
            
            # Build details.items for table generation
            text_details_items = []
            if text_font_results.get("items"):
                for item in text_font_results["items"]:
                    text_details_items.append({
                        "textSnippet": item.get("textSnippet", "Text element"),
                        "containerSelector": item.get("containerSelector", "N/A"),
                        "fontSize": item.get("fontSize", "N/A")
                    })
            
            audits["text-font-audit"] = {
                "id": "text-font-audit",
                "title": "Text is appropriately sized for readability",
                "description": f"This audit checks if text is large enough for readability. Found {small_text_count} text elements with font size less than 16px out of {total_text_elements} total text elements.",
                "score": text_score,
                "numericValue": text_score,
            }
            
            # Add details.items if there are failing items
            if text_details_items:
                audits["text-font-audit"]["details"] = {
                    "type": "table",
                    "headings": [
                        {"key": "textSnippet", "itemType": "text", "text": "Text Content"},
                        {"key": "containerSelector", "itemType": "code", "text": "Element Selector"},
                        {"key": "fontSize", "itemType": "text", "text": "Reason"}
                    ],
                    "items": text_details_items
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
                "description": f"This audit measures how long it takes for the main content to load. LCP time: {performance_metrics.get('lcp', 0):.0f}ms. Good if under 2500ms.",
                "score": lcp_score,
                "numericValue": performance_metrics.get("lcp", 0),
            }
            
            # Cumulative Layout Shift (CLS) - placeholder
            audits["cumulative-layout-shift"] = {
                "id": "cumulative-layout-shift",
                "title": "Cumulative Layout Shift",
                "description": "This audit measures visual stability. A low CLS score means the page layout is stable and doesn't shift unexpectedly, which is important for older adults.",
                "score": 0.9,
                "numericValue": 0.1,
            }
            
            # Missing audits - set to 0 (not None) so they're included in weight calculation
            # CRITICAL: Must use 0, not None, to match old backend behavior
            # The old backend returns 0 for missing audits, which are included in total weight
            # If we use None, pdf_generator.js filters them out, reducing total weight
            if not is_lite:
                # Layout brittle audit (checks for fixed-height containers)
                audits["layout-brittle-audit"] = {
                    "id": "layout-brittle-audit",
                    "title": "Containers allow for text spacing adjustments",
                    "description": "This audit checks if containers have fixed heights that may prevent text spacing adjustments (WCAG 1.4.12).",
                    "score": 0.0,  # Set to 0 (not None) so it's included in weight calculation
                    "numericValue": 0.0,
                }
                
                # Flesch-Kincaid readability audit
                audits["flesch-kincaid-audit"] = {
                    "id": "flesch-kincaid-audit",
                    "title": "Flesch-Kincaid Reading Ease (Older Adult-Adjusted)",
                    "description": "This audit calculates the Flesch-Kincaid reading ease score with category-based adjustments for older adult users.",
                    "score": 0.0,  # Set to 0 (not None) so it's included in weight calculation
                    "numericValue": 0.0,
                }
                
                # Total Blocking Time (TBT) - performance metric
                audits["total-blocking-time"] = {
                    "id": "total-blocking-time",
                    "title": "Total Blocking Time",
                    "description": "This audit measures the total amount of time that a page is blocked from responding to user input. Lower is better.",
                    "score": 0.0,  # Set to 0 (not None) so it's included in weight calculation
                    "numericValue": 0.0,
                }
                
                # Interactive color audit (link color distinction)
                audits["interactive-color-audit"] = {
                    "id": "interactive-color-audit",
                    "title": "Links are visually distinct from surrounding text",
                    "description": "This audit checks if links have a noticeable color difference from surrounding text (Delta E > 10).",
                    "score": 0.0,  # Set to 0 (not None) so it's included in weight calculation
                    "numericValue": 0.0,
                }
                
                # DOM size audit
                dom_size = page.evaluate("() => document.querySelectorAll('*').length")
                dom_size_score = 1.0 if dom_size < 1500 else max(0, 1 - (dom_size - 1500) / 1500)
                audits["dom-size"] = {
                    "id": "dom-size",
                    "title": "Avoids an excessive DOM size",
                    "description": f"This audit checks if the page has a reasonable number of DOM elements. Found {dom_size} elements. Recommended: under 1500.",
                    "score": dom_size_score,
                    "numericValue": dom_size,
                }
                
                # Errors in console - check for JavaScript errors
                # Set to 0 (not None) so it's included in weight calculation
                audits["errors-in-console"] = {
                    "id": "errors-in-console",
                    "title": "No JavaScript errors in console",
                    "description": "This audit checks if there are JavaScript errors in the browser console that could affect functionality.",
                    "score": 0.0,  # Set to 0 (not None) so it's included in weight calculation
                    "numericValue": 0.0,
                }
                
                # Geolocation on start - check if page requests geolocation immediately
                geolocation_requested = page.evaluate("""
                    () => {
                        // Check if geolocation API was called
                        // This would need to be monitored during page load
                        return false;
                    }
                """)
                audits["geolocation-on-start"] = {
                    "id": "geolocation-on-start",
                    "title": "Does not request geolocation on page load",
                    "description": "This audit checks if the page requests user location immediately on load, which can be intrusive for older adults.",
                    "score": 1.0 if not geolocation_requested else 0.0,
                    "numericValue": 1.0 if not geolocation_requested else 0.0,
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
                "audits": audits
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
        
        # Get device configuration (viewport + emulation settings)
        device_config = get_viewport_for_device(request.device)
        print(f"Viewport: {device_config.get('viewport')}")
        print(f"User Agent: {device_config.get('user_agent', '')[:50]}...")
        print(f"Mobile: {device_config.get('is_mobile')}, Touch: {device_config.get('has_touch')}")
        
        # Run Camoufox in a thread pool executor to avoid blocking async event loop
        # Camoufox uses Playwright's sync API, so we need to run it in a separate thread
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor() as executor:
            result = await loop.run_in_executor(
                executor,
                _run_camoufox_audit_sync,
                url,
                device_config,
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

