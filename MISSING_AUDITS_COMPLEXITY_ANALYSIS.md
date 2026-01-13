# Missing Audits - Complexity Analysis & Implementation Guide

## 🟢 EASY (1-2 days) - Can be added quickly using existing data/tools

### 1. **Breadcrumb Navigation Detection** ⭐⭐⭐
**Complexity:** LOW  
**Effort:** 1 day  
**Why Easy:**
- Can query DOM for common breadcrumb patterns: `nav[aria-label*="breadcrumb"]`, `.breadcrumb`, `ol[class*="breadcrumb"]`
- Already have DOM access via Camoufox/Playwright
- Just need to check presence and structure
- Score: 1.0 if found and properly structured, 0.0 if missing

**Implementation:**
```javascript
// Add to scanner_service.py in _run_camoufox_audit_sync
breadcrumbs = page.evaluate("""
    () => {
        const selectors = [
            'nav[aria-label*="breadcrumb" i]',
            '.breadcrumb',
            'ol[class*="breadcrumb" i]',
            '[role="navigation"][aria-label*="breadcrumb" i]'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.querySelectorAll('a, li').length >= 2) {
                return { found: true, selector: sel, items: el.querySelectorAll('a, li').length };
            }
        }
        return { found: false };
    }
""")
```

**Add to config:** Weight 3

---

### 2. **Search Functionality Detection** ⭐⭐
**Complexity:** LOW  
**Effort:** 1 day  
**Why Easy:**
- Query for search inputs: `input[type="search"]`, `input[name*="search" i]`, `input[id*="search" i]`, `form[role="search"]`
- Check if search form has submit button
- Already have form analysis capabilities

**Implementation:**
```javascript
search_box = page.evaluate("""
    () => {
        const selectors = [
            'input[type="search"]',
            'input[name*="search" i]',
            'input[id*="search" i]',
            'form[role="search"] input',
            '.search input'
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) { // visible
                const form = el.closest('form');
                const hasSubmit = form && (form.querySelector('button[type="submit"], input[type="submit"]') !== null);
                return { found: true, selector: sel, hasSubmit: hasSubmit };
            }
        }
        return { found: false };
    }
""")
```

**Add to config:** Weight 5

---

### 3. **Contact Information Visibility** ⭐⭐
**Complexity:** LOW  
**Effort:** 1-2 days  
**Why Easy:**
- Use regex patterns to find phone numbers, email addresses in visible text
- Check footer, header, contact page links
- Can use existing text collection (`PageText` gatherer)

**Implementation:**
```javascript
contact_info = page.evaluate("""
    () => {
        const bodyText = document.body.innerText;
        const phoneRegex = /(\\+?\\d{1,3}[-.\\s]?)?\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}/g;
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
        
        const phones = bodyText.match(phoneRegex) || [];
        const emails = bodyText.match(emailRegex) || [];
        
        // Check for contact links
        const contactLinks = Array.from(document.querySelectorAll('a[href*="contact" i], a[href*="mailto:"], a[href*="tel:"]')).length;
        
        return {
            phoneCount: phones.length,
            emailCount: emails.length,
            contactLinks: contactLinks,
            score: (phones.length > 0 || emails.length > 0 || contactLinks > 0) ? 1.0 : 0.0
        };
    }
""")
```

**Add to config:** Weight 3

---

### 4. **Skip Links Detection** ⭐
**Complexity:** VERY LOW  
**Effort:** 4 hours  
**Why Easy:**
- Simple DOM query: `a[href^="#main"], a[href^="#content"], a.skip-link, .skip-to-content`
- Check if skip links are visible when focused
- Already have link analysis

**Implementation:**
```javascript
skip_links = page.evaluate("""
    () => {
        const selectors = [
            'a[href^="#main"]',
            'a[href^="#content"]',
            'a.skip-link',
            '.skip-to-content',
            'a[class*="skip" i]'
        ];
        const found = document.querySelectorAll(selectors.join(','));
        return { count: found.length, score: found.length > 0 ? 1.0 : 0.0 };
    }
""")
```

**Add to config:** Weight 2

---

### 5. **Menu Structure Analysis** ⚠️ (Partial - Easy part)
**Complexity:** LOW-MEDIUM  
**Effort:** 2 days  
**Why Easy (for basic):**
- Query for `nav`, `ul.menu`, `.navigation` elements
- Count menu items and depth levels
- Check if menu is accessible (keyboard, ARIA)

**Implementation (Basic):**
```javascript
menu_structure = page.evaluate("""
    () => {
        const navs = document.querySelectorAll('nav, [role="navigation"]');
        let maxDepth = 0;
        let totalItems = 0;
        
        navs.forEach(nav => {
            const items = nav.querySelectorAll('a, button');
            totalItems += items.length;
            
            // Calculate depth
            let depth = 0;
            let current = nav;
            while (current.querySelector('ul, ol')) {
                depth++;
                current = current.querySelector('ul, ol');
            }
            maxDepth = Math.max(maxDepth, depth);
        });
        
        return {
            navCount: navs.length,
            totalItems: totalItems,
            maxDepth: maxDepth,
            // Score: good if has nav, not too deep (<=2 levels), has items
            score: navs.length > 0 && maxDepth <= 2 && totalItems > 0 ? 1.0 : 0.5
        };
    }
""")
```

**Add to config:** Weight 5 (for basic version)

---

### 6. **Privacy Policy Link Detection** ⭐⭐
**Complexity:** LOW  
**Effort:** 1 day  
**Why Easy:**
- Simple link checking: `a[href*="privacy" i]`, footer links
- Check if link exists and is accessible

**Implementation:**
```javascript
privacy_link = page.evaluate("""
    () => {
        const links = document.querySelectorAll('a[href*="privacy" i], a[href*="privacy-policy" i]');
        const visible = Array.from(links).filter(link => link.offsetParent !== null);
        return { found: visible.length > 0, count: visible.length, score: visible.length > 0 ? 1.0 : 0.0 };
    }
""")
```

**Add to config:** Weight 2

---

## 🟡 MEDIUM (3-5 days) - Require new logic but feasible

### 7. **ARIA Attributes Validation** ⚠️
**Complexity:** MEDIUM  
**Effort:** 3-4 days  
**Why Medium:**
- Need to check all interactive elements for proper ARIA labels
- Validate ARIA relationships (aria-labelledby, aria-describedby)
- Check for ARIA misuse (e.g., role="button" on div without keyboard support)
- Can use Lighthouse's Accessibility audit as base, but need custom scoring

**Implementation Approach:**
- Leverage Lighthouse's `Accessibility` artifact (already available)
- Add custom audit that checks ARIA completeness for seniors
- Focus on: buttons without labels, forms without descriptions, landmarks

**Add to config:** Weight 5

---

### 8. **Keyboard Navigation Testing** ⚠️
**Complexity:** MEDIUM  
**Effort:** 4-5 days  
**Why Medium:**
- Need to programmatically simulate keyboard navigation
- Test Tab order, Enter/Space on buttons, Escape to close modals
- Complex because requires interactive testing, not just static analysis
- Can use Playwright's keyboard API

**Implementation Approach:**
```python
# In scanner_service.py
def test_keyboard_navigation(page):
    """Test if all interactive elements are keyboard accessible"""
    results = page.evaluate("""
        () => {
            const interactive = document.querySelectorAll(
                'a[href], button, input, select, textarea, [tabindex], [role="button"], [role="link"]'
            );
            let accessible = 0;
            let issues = [];
            
            interactive.forEach(el => {
                // Check if element is focusable
                const tabIndex = el.tabIndex;
                const hasKeyboardSupport = tabIndex >= 0 || 
                    (el.tagName === 'A' && el.href) ||
                    (el.tagName === 'BUTTON') ||
                    (el.tagName in ['INPUT', 'SELECT', 'TEXTAREA']);
                
                if (!hasKeyboardSupport) {
                    issues.push({
                        element: el.tagName,
                        selector: el.id || el.className,
                        issue: 'Not keyboard accessible'
                    });
                } else {
                    accessible++;
                }
            });
            
            return {
                total: interactive.length,
                accessible: accessible,
                issues: issues,
                score: issues.length === 0 ? 1.0 : max(0, 1 - (issues.length / interactive.length))
            };
        }
    """)
    return results
```

**Add to config:** Weight 10 (high importance for accessibility)

---

### 9. **Form Error Handling Analysis** ⚠️
**Complexity:** MEDIUM  
**Effort:** 3-4 days  
**Why Medium:**
- Need to trigger form validation errors
- Check if error messages are clear and visible
- Test error announcement for screen readers
- Requires form interaction, but can be done with Playwright

**Implementation Approach:**
```python
def analyze_form_errors(page):
    """Check form error handling quality"""
    results = page.evaluate("""
        () => {
            const forms = document.querySelectorAll('form');
            let goodForms = 0;
            let issues = [];
            
            forms.forEach(form => {
                const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
                
                // Check if form has error message containers
                const hasErrorArea = form.querySelector('[role="alert"], .error, [aria-live]');
                
                // Check if inputs have aria-invalid, aria-describedby for errors
                let hasProperARIA = true;
                inputs.forEach(input => {
                    if (input.hasAttribute('aria-required') && !input.hasAttribute('aria-describedby')) {
                        hasProperARIA = false;
                    }
                });
                
                if (hasErrorArea && hasProperARIA) {
                    goodForms++;
                } else {
                    issues.push({
                        formId: form.id || 'unnamed',
                        missing: !hasErrorArea ? 'error display' : 'ARIA attributes'
                    });
                }
            });
            
            return {
                totalForms: forms.length,
                goodForms: goodForms,
                issues: issues,
                score: forms.length > 0 ? (goodForms / forms.length) : 1.0
            };
        }
    """)
    return results
```

**Add to config:** Weight 5

---

### 10. **Information Density Calculation** ⚠️
**Complexity:** MEDIUM  
**Effort:** 3 days  
**Why Medium:**
- Need to calculate content vs. whitespace ratio
- Measure visual density (elements per viewport area)
- Count text blocks, images, interactive elements per section
- Requires layout analysis

**Implementation:**
```javascript
info_density = page.evaluate("""
    () => {
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const viewportArea = viewport.width * viewport.height;
        
        // Count visible elements in viewport
        const visibleElements = document.elementsFromPoint(viewport.width/2, viewport.height/2);
        const textBlocks = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').length;
        const images = document.querySelectorAll('img[src]').length;
        const interactive = document.querySelectorAll('a, button, input').length;
        
        // Calculate density score (lower is better for seniors)
        const totalElements = textBlocks + images + interactive;
        const density = totalElements / (viewportArea / 10000); // elements per 10k pixels
        
        // Score: 1.0 for density < 20, decreasing to 0.0 at density > 50
        const score = density < 20 ? 1.0 : Math.max(0, 1 - ((density - 20) / 30));
        
        return {
            density: density.toFixed(2),
            textBlocks: textBlocks,
            images: images,
            interactive: interactive,
            score: score
        };
    }
""")
```

**Add to config:** Weight 5

---

## 🔴 HARD (1-2 weeks) - Require new tools or significant infrastructure

### 11. **WCAG 2.2 Level AA Compliance** ❌
**Complexity:** HIGH  
**Effort:** 1-2 weeks  
**Why Hard:**
- Requires comprehensive WCAG testing framework
- Need to check 50+ WCAG criteria
- Some checks require human judgment (e.g., "content is not time-based")
- Best approach: Integrate with axe-core or WAVE API
- **Recommendation:** Use existing Lighthouse accessibility audits + axe-core integration

**Implementation Approach:**
```bash
# Install axe-core
npm install @axe-core/cli
```

```python
# Integrate axe-core in Python scanner
import subprocess
import json

def run_axe_audit(url):
    """Run axe-core accessibility audit"""
    result = subprocess.run([
        'axe', '--url', url, '--tags', 'wcag2aa', '--format', 'json'
    ], capture_output=True, text=True)
    
    violations = json.loads(result.stdout).get('violations', [])
    # Convert violations to score (100 - violations * 2)
    score = max(0, 100 - len(violations) * 2) / 100
    return { score: score, violations: violations }
```

**Alternative:** Use Lighthouse's built-in accessibility audits (already available) and aggregate them into a WCAG compliance score.

**Add to config:** Weight 15 (critical)

---

### 12. **Screen Reader Compatibility** ❌
**Complexity:** HIGH  
**Effort:** 1-2 weeks  
**Why Hard:**
- Requires actual screen reader testing (NVDA, JAWS, VoiceOver)
- Need to simulate screen reader behavior programmatically
- Complex because screen readers interpret content differently than browsers
- **Recommendation:** Use ARIA validation + semantic HTML checks as proxy
- Full testing would require browser automation with screen reader APIs (very complex)

**Partial Solution (Medium Complexity):**
- Check semantic HTML usage (headings, landmarks, alt text)
- Validate ARIA attributes
- Test keyboard navigation (already covered above)
- Score based on these proxies

**Add to config:** Weight 10 (use proxy metrics)

---

### 13. **Task Simplification Assessment** ❌
**Complexity:** VERY HIGH  
**Effort:** 2+ weeks  
**Why Very Hard:**
- Requires understanding user intent and task flows
- Need to measure cognitive load of completing tasks
- Would need AI/ML to analyze task complexity
- Currently no standard way to measure this automatically
- **Recommendation:** Defer or use heuristic-based scoring

**Heuristic Approach (Medium Complexity):**
- Count steps to complete common tasks (find contact info, make purchase)
- Measure form complexity (fields per form, required fields)
- Analyze navigation depth (clicks to reach content)
- Score based on these metrics

**Add to config:** Weight 5 (if using heuristics)

---

## 📊 Implementation Priority Matrix

| Audit | Complexity | Effort | Impact | Priority | Recommended Weight |
|-------|-----------|--------|--------|----------|-------------------|
| Breadcrumb Detection | 🟢 Easy | 1 day | Medium | HIGH | 3 |
| Search Functionality | 🟢 Easy | 1 day | High | HIGH | 5 |
| Contact Info Visibility | 🟢 Easy | 1-2 days | High | HIGH | 3 |
| Skip Links | 🟢 Easy | 4 hours | Medium | MEDIUM | 2 |
| Privacy Policy Link | 🟢 Easy | 1 day | Medium | MEDIUM | 2 |
| Menu Structure (Basic) | 🟢 Easy | 2 days | High | HIGH | 5 |
| ARIA Validation | 🟡 Medium | 3-4 days | High | HIGH | 5 |
| Keyboard Navigation | 🟡 Medium | 4-5 days | Critical | CRITICAL | 10 |
| Form Error Handling | 🟡 Medium | 3-4 days | Medium | MEDIUM | 5 |
| Information Density | 🟡 Medium | 3 days | Medium | MEDIUM | 5 |
| WCAG Compliance | 🔴 Hard | 1-2 weeks | Critical | CRITICAL | 15* |
| Screen Reader (Proxy) | 🟡 Medium | 1 week | High | HIGH | 10 |
| Task Simplification | 🔴 Very Hard | 2+ weeks | Low | LOW | 5* |

\* Use Lighthouse accessibility audits as proxy

---

## 🚀 Recommended Quick Wins (Can add in 1 week)

### Phase 1: Easy Wins (3-4 days total)
1. ✅ Breadcrumb Detection (1 day)
2. ✅ Search Functionality (1 day)
3. ✅ Contact Information (1 day)
4. ✅ Privacy Policy Link (1 day)

**Total Weight Added:** 12 points  
**Impact:** Adds Navigation & Trust Signals coverage

### Phase 2: Medium Complexity (1-2 weeks)
5. ✅ Menu Structure Analysis (2 days)
6. ✅ Keyboard Navigation Testing (4-5 days)
7. ✅ ARIA Validation (3-4 days)
8. ✅ Information Density (3 days)

**Total Weight Added:** 30 points  
**Impact:** Adds Technical Accessibility, Navigation, Cognitive Load coverage

### Phase 3: Advanced (3-4 weeks)
9. ⚠️ WCAG Compliance (use Lighthouse accessibility aggregation)
10. ⚠️ Screen Reader Compatibility (proxy via ARIA + semantic HTML)
11. ⚠️ Form Error Handling (3-4 days)
12. ❌ Task Simplification (defer or use heuristics)

---

## 💡 Implementation Notes

### Using Existing Lighthouse Audits:
- Lighthouse already has many accessibility audits
- We can aggregate them into a "WCAG Compliance" score
- No need to reimplement everything from scratch

### Data Collection Strategy:
- Most "Easy" audits can be added to `scanner_service.py` in the `_run_camoufox_audit_sync` function
- Use `page.evaluate()` to run JavaScript in browser context
- Return structured data that can be scored

### Scoring Approach:
- Keep consistent with existing audit scoring (0.0 to 1.0)
- Use weighted averages (like current system)
- Provide detailed findings in `details.items` for PDF reports

---

## 🎯 Immediate Action Items

**To add the 4 Easy Wins:**
1. Modify `scanner_service.py` to add new audit functions
2. Add audits to `FULL_AUDIT_REFS` in `custom-config.js`
3. Add audit info to `AUDIT_INFO` in `pdf_generator.js`
4. Update PDF generator to display new audit results
5. Test with sample websites

**Estimated Total Time for Phase 1:** 3-4 days

**Estimated Total Time for Phase 2:** 1-2 weeks

**Estimated Total Time for Full Implementation:** 4-6 weeks (excluding Task Simplification)


