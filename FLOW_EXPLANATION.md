# Complete Flow Explanation: Node.js → Python Scanner → Report Generation

## Overview

This document explains the complete flow from when a user requests a scan to when they receive the final PDF report.

---

## 🔄 Complete Flow Diagram

```
User Request
    ↓
Node.js Server (Express)
    ↓
Persistent Queue (5 parallel jobs)
    ↓
runLighthouseAudit() / runLighthouseLiteAudit()
    ↓
python-scanner-client.js (HTTP POST)
    ↓
Python FastAPI Service (port 8001)
    ↓
Camoufox Browser (scans website)
    ↓
Python calculates audits & score
    ↓
Python saves JSON report to /tmp
    ↓
Python returns JSON report path to Node.js
    ↓
Node.js reads JSON file
    ↓
Node.js generates PDF report
    ↓
Node.js sends email with PDF
```

---

## 📋 Step-by-Step Flow

### **Step 1: User Initiates Scan**

**Location**: Frontend → Backend API

- User submits scan request via frontend
- Request goes to Node.js Express server
- Server validates request and adds job to queue

**Code**: `backend-silver-surfers/my-app/services/server/routes/auditRoutes.js`

---

### **Step 2: Queue Processing**

**Location**: `backend-silver-surfers/my-app/services/server/server.js`

```javascript
// Queue configured for 5 parallel scans
quickScanQueue = new PersistentQueue('QuickScan', runQuickScanProcess, {
  concurrency: 5,  // 5 parallel scans
  maxRetries: 3,
  retryDelay: 5000
});
```

- Queue processes up to 5 jobs simultaneously
- Each job calls `runQuickScanProcess()` or `runFullAuditProcess()`

---

### **Step 3: Node.js Calls Python Scanner**

**Location**: `backend-silver-surfers/my-app/services/load_and_audit/audit-module-with-lite.js`

```javascript
export async function runLighthouseAudit(options) {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // Directly call Python scanner (no Node.js strategies)
    const { tryPythonScanner } = await import('./python-scanner-client.js');
    const result = await tryPythonScanner({
        url: fullUrl,
        device: device,
        format: format,
        isLiteVersion: isLiteVersion
    });
    
    return result;  // Returns { success: true, reportPath: '/tmp/report-...json' }
}
```

**What happens**:
- Node.js makes HTTP POST request to Python service
- Sends: `{ url, device, format, isLiteVersion }`
- Waits for response (timeout: 3 minutes)

---

### **Step 4: Python Scanner Client (HTTP Request)**

**Location**: `backend-silver-surfers/my-app/services/load_and_audit/python-scanner-client.js`

```javascript
export async function tryPythonScanner(options) {
    const response = await axios.post(`${PYTHON_SCANNER_URL}/audit`, {
        url: url,
        device: device,
        format: format,
        isLiteVersion: isLiteVersion
    }, {
        timeout: 180000,  // 3 minutes
    });
    
    // Returns Python response converted to Node.js format
    return {
        success: true,
        reportPath: response.data.reportPath,  // '/tmp/report-example-com-1234567890.json'
        // ... other fields
    };
}
```

**What happens**:
- Makes HTTP POST to `http://localhost:8001/audit`
- Sends JSON payload with scan parameters
- Receives JSON response with report path

---

### **Step 5: Python Service Receives Request**

**Location**: `backend-silver-surfers/python-scanner/scanner_service.py`

```python
@app.post("/audit", response_model=AuditResponse)
async def perform_audit(request: AuditRequest):
    # 1. Launch Camoufox browser
    with Camoufox(headless=True, viewport=viewport) as browser:
        page = await browser.new_page()
        
        # 2. Navigate to URL
        await page.goto(url, wait_until="networkidle", timeout=60000)
        
        # 3. Perform accessibility audits
        report = await perform_accessibility_audit(page, url, request.isLiteVersion)
        
        # 4. Calculate score
        final_score = calculate_score(report, request.isLiteVersion)
        
        # 5. Save JSON report to /tmp
        report_path = os.path.join(temp_dir, report_filename)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        
        # 6. Return response
        return AuditResponse(
            success=True,
            reportPath=report_path,  # '/tmp/report-example-com-1234567890.json'
            report=report,  # Full JSON report
            # ... other fields
        )
```

**What happens**:
1. **Launches Camoufox browser** (stealth browser with anti-detection)
2. **Navigates to URL** (bypasses bot protection)
3. **Performs audits** (checks accessibility, contrast, font size, etc.)
4. **Calculates score** (weighted average of all audits)
5. **Saves JSON report** to `/tmp/report-{hostname}-{timestamp}.json`
6. **Returns response** with report path and full JSON

---

### **Step 6: Python Performs Accessibility Audits**

**Location**: `backend-silver-surfers/python-scanner/scanner_service.py` → `perform_accessibility_audit()`

```python
async def perform_accessibility_audit(page, url: str, is_lite: bool = False):
    # Navigate to page
    await page.goto(url, wait_until="networkidle", timeout=60000)
    
    # Get HTML content
    html_content = await page.content()
    soup = BeautifulSoup(html_content, "lxml")
    
    # Perform various audits using JavaScript evaluation
    audits = {}
    
    # Example: Target size audit
    small_targets = await page.evaluate("""
        () => {
            const elements = document.querySelectorAll('a, button, input[type="button"]');
            let smallCount = 0;
            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 44 || rect.height < 44) smallCount++;
            });
            return { total: elements.length, small: smallCount };
        }
    """)
    
    # Calculate score for this audit
    target_score = 1.0 if small_targets["small"] == 0 else max(0, 1 - (small_targets["small"] / max(small_targets["total"], 1)))
    audits["target-size"] = {
        "id": "target-size",
        "title": "Touch targets have sufficient size and spacing",
        "score": target_score,
        "numericValue": target_score,
    }
    
    # ... more audits (color-contrast, link-name, button-name, etc.)
    
    # Build Lighthouse-compatible report
    report = {
        "lighthouseVersion": "10.0.0",
        "categories": {
            "senior-friendly-lite": {
                "score": final_score / 100,
                "auditRefs": LITE_AUDIT_REFS
            }
        },
        "audits": audits
    }
    
    return report
```

**What audits are performed**:
- **Color Contrast**: Checks if text has sufficient contrast
- **Target Size**: Checks if clickable elements are large enough (≥44px)
- **Viewport**: Checks for responsive meta tag
- **Link Names**: Checks if links have accessible names
- **Button Names**: Checks if buttons have accessible names
- **Form Labels**: Checks if form inputs have labels
- **Heading Order**: Checks if headings are in sequential order
- **HTTPS**: Checks if site uses HTTPS
- **Text Font Size**: Checks if text is readable (≥16px)
- **Performance**: Checks LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift)

---

### **Step 7: Python Calculates Score**

**Location**: `backend-silver-surfers/python-scanner/scanner_service.py` → `calculate_score()`

```python
def calculate_score(report: Dict[str, Any], is_lite: bool = False) -> float:
    # Get audit references (with weights)
    audit_refs = LITE_AUDIT_REFS if is_lite else FULL_AUDIT_REFS
    
    # Example weights for Lite:
    # [
    #   {"id": "color-contrast", "weight": 5},
    #   {"id": "target-size", "weight": 5},
    #   {"id": "text-font-audit", "weight": 5},
    #   {"id": "viewport", "weight": 3},
    #   ...
    # ]
    
    audits = report.get("audits", {})
    total_weighted_score = 0
    total_weight = 0
    
    # Calculate weighted average
    for audit_ref in audit_refs:
        audit_id = audit_ref["id"]
        weight = audit_ref["weight"]
        result = audits.get(audit_id, {})
        score = result.get("score", 0) if result else 0  # Score is 0-1
        
        total_weighted_score += score * weight
        total_weight += weight
    
    # Final score: (total_weighted_score / total_weight) * 100
    final_score = (total_weighted_score / total_weight * 100) if total_weight > 0 else 0
    return round(final_score, 2)  # Returns 0-100
```

**Score Calculation Example**:
```
color-contrast: score=0.9, weight=5 → contribution = 0.9 * 5 = 4.5
target-size: score=0.8, weight=5 → contribution = 0.8 * 5 = 4.0
text-font-audit: score=0.7, weight=5 → contribution = 0.7 * 5 = 3.5
viewport: score=1.0, weight=3 → contribution = 1.0 * 3 = 3.0
...

Total weighted score = 4.5 + 4.0 + 3.5 + 3.0 + ... = 35.0
Total weight = 5 + 5 + 5 + 3 + ... = 50

Final score = (35.0 / 50) * 100 = 70%
```

**Important**: This matches the exact same logic as Node.js `calculateLiteScore()` and `calculateSeniorFriendlinessScore()` functions.

---

### **Step 8: Python Returns JSON Report Path**

**Location**: `backend-silver-surfers/python-scanner/scanner_service.py`

```python
# Save report to /tmp/report-example-com-1234567890.json
report_path = os.path.join(temp_dir, report_filename)
with open(report_path, "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2)

return AuditResponse(
    success=True,
    reportPath=report_path,  # '/tmp/report-example-com-1234567890.json'
    report=report,  # Full JSON object (also included in response)
    score=final_score,  # 70.0
    # ... other fields
)
```

**Response sent to Node.js**:
```json
{
  "success": true,
  "reportPath": "/tmp/report-example-com-1234567890.json",
  "report": {
    "lighthouseVersion": "10.0.0",
    "categories": {
      "senior-friendly-lite": {
        "score": 0.70
      }
    },
    "audits": {
      "color-contrast": { "score": 0.9, ... },
      "target-size": { "score": 0.8, ... },
      ...
    }
  },
  "version": "Lite",
  "device": "desktop",
  "strategy": "Python-Camoufox"
}
```

---

### **Step 9: Node.js Receives Response**

**Location**: `backend-silver-surfers/my-app/services/load_and_audit/python-scanner-client.js`

```javascript
if (response.data && response.data.success) {
    // Convert Python response to Node.js format
    return {
        success: true,
        reportPath: response.data.reportPath,  // '/tmp/report-example-com-1234567890.json'
        isLiteVersion: response.data.isLiteVersion,
        version: response.data.version,
        url: response.data.url,
        device: response.data.device,
        strategy: response.data.strategy || 'Python-Camoufox',
        // ... other fields
    };
}
```

**What happens**:
- Node.js receives the response
- Extracts `reportPath` (path to JSON file)
- Returns result to calling function

---

### **Step 10: Node.js Generates PDF Report**

**Location**: `backend-silver-surfers/my-app/services/server/services/auditService.js` (or similar)

```javascript
// After receiving scan result
const liteAuditResult = await runLighthouseLiteAudit({
    url: url,
    device: 'desktop',
    format: 'json'
});

if (liteAuditResult.success) {
    jsonReportPath = liteAuditResult.reportPath;  // '/tmp/report-example-com-1234567890.json'
    
    // Generate PDF from JSON
    const pdfResult = await generateLiteAccessibilityReport(
        jsonReportPath,  // Path to JSON file
        userSpecificOutputDir  // Output directory
    );
    
    console.log(`📊 Quick scan score: ${pdfResult.score}%`);
}
```

---

### **Step 11: PDF Generation Reads JSON and Calculates Score**

**Location**: `backend-silver-surfers/my-app/services/report_generation/pdf-generator-lite.js`

```javascript
export async function generateLiteAccessibilityReport(inputFile, outputDirectory) {
    // 1. Read JSON file
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const reportData = JSON.parse(rawData);
    
    // 2. Calculate score (same logic as Python)
    const scoreData = calculateLiteScore(reportData);
    // calculateLiteScore() uses the same weights and formula as Python
    
    // 3. Generate PDF
    const generator = new LiteAccessibilityPDFGenerator();
    await generator.generateLiteReport(inputFile, outputFile);
    
    return {
        success: true,
        reportPath: outputFile,
        score: scoreData.finalScore  // 70.0
    };
}
```

**Score Calculation in Node.js** (matches Python exactly):

```javascript
function calculateLiteScore(report) {
    const categoryId = 'senior-friendly-lite';
    const categoryConfig = customConfigLite.categories[categoryId];
    const auditRefs = categoryConfig.auditRefs;  // Same weights as Python
    
    const auditResults = report.audits;
    let totalWeightedScore = 0;
    let totalWeight = 0;
    
    for (const auditRef of auditRefs) {
        const { id, weight } = auditRef;
        const result = auditResults[id];
        const score = result ? (result.score ?? 0) : 0;
        totalWeightedScore += score * weight;
        totalWeight += weight;
    }
    
    const finalScore = totalWeight === 0 ? 0 : (totalWeightedScore / totalWeight) * 100;
    return { finalScore };
}
```

**Important**: This is the **exact same calculation** as Python's `calculate_score()` function.

---

### **Step 12: PDF Report Generated**

**Location**: `backend-silver-surfers/my-app/services/report_generation/pdf-generator-lite.js`

The PDF generator:
1. Reads the JSON report file
2. Extracts audit results and scores
3. Generates PDF with:
   - Title page
   - Score summary
   - Detailed audit results
   - Recommendations
4. Saves PDF to output directory

---

### **Step 13: Email Sent with PDF**

**Location**: `backend-silver-surfers/my-app/services/server/services/auditService.js`

```javascript
// After PDF generation
await sendAuditReportEmail({
    to: email,
    subject: 'Your SilverSurfers Quick Scan Results',
    folder: userSpecificOutputDir,  // Contains PDF
    // ... other options
});
```

---

## 🔑 Key Points

### **1. Score Calculation is Identical**

Both Python and Node.js use the **exact same formula**:
- Same audit IDs
- Same weights
- Same calculation: `(totalWeightedScore / totalWeight) * 100`

**Python** (`scanner_service.py`):
```python
LITE_AUDIT_REFS = [
    {"id": "color-contrast", "weight": 5},
    {"id": "target-size", "weight": 5},
    ...
]
```

**Node.js** (`custom-config-lite.js`):
```javascript
auditRefs: [
    { id: 'color-contrast', weight: 5 },
    { id: 'target-size', weight: 5 },
    ...
]
```

### **2. Report Format is Lighthouse-Compatible**

Python returns a JSON structure that matches Lighthouse format:
```json
{
  "lighthouseVersion": "10.0.0",
  "categories": {
    "senior-friendly-lite": {
      "score": 0.70
    }
  },
  "audits": {
    "color-contrast": { "score": 0.9, ... },
    "target-size": { "score": 0.8, ... }
  }
}
```

This format is compatible with existing Node.js PDF generators.

### **3. Parallel Processing**

- **Node.js Queue**: Processes 5 jobs concurrently
- **Python FastAPI**: Handles multiple async requests simultaneously
- **Each scan**: Gets its own Camoufox browser instance (isolated)

### **4. File Flow**

```
Python saves: /tmp/report-example-com-1234567890.json
    ↓
Node.js reads: /tmp/report-example-com-1234567890.json
    ↓
Node.js generates: reports-lite/user@email.com_lite/www-example-com.pdf
    ↓
Node.js emails: PDF attached to email
```

---

## 📊 Summary

1. **Node.js** receives scan request → adds to queue
2. **Node.js** calls **Python** via HTTP POST
3. **Python** uses **Camoufox** to scan website
4. **Python** performs accessibility audits
5. **Python** calculates score (weighted average)
6. **Python** saves JSON report to `/tmp`
7. **Python** returns report path to **Node.js**
8. **Node.js** reads JSON file
9. **Node.js** calculates score again (verification - same formula)
10. **Node.js** generates PDF from JSON
11. **Node.js** sends email with PDF

**Score is calculated twice** (Python and Node.js) using the **same formula** to ensure consistency.

