# Lighthouse + Camoufox Hybrid Integration

## Overview

This document explains how to combine **Lighthouse** (for accurate audits) with **Camoufox** (for anti-detection) to get the best of both worlds.

## Why This Approach?

- **Lighthouse**: Provides accurate audit scores matching the old backend
- **Camoufox**: Provides advanced anti-detection to bypass bot protection
- **Combined**: Accurate audits + successful scanning of protected sites

## Architecture Options

### Option 1: Node.js Subprocess (Recommended)

**How it works:**
1. Python launches Camoufox browser with anti-detection
2. Python calls Node.js subprocess to run Lighthouse
3. Lighthouse connects to Camoufox browser via CDP (Chrome DevTools Protocol)
4. Lighthouse runs audits and returns report

**Pros:**
- Uses official Lighthouse Node.js API
- Full compatibility with custom configs
- Reliable and well-tested

**Cons:**
- Requires Node.js runtime in Python container
- Slightly more complex setup

### Option 2: Direct CDP Connection

**How it works:**
1. Python launches Camoufox browser
2. Get CDP WebSocket endpoint from browser
3. Connect Lighthouse directly via CDP

**Pros:**
- More direct connection
- Potentially faster

**Cons:**
- Requires CDP endpoint access
- More complex implementation

## Implementation Steps

### Step 1: Update Dockerfile

Add Node.js to Python scanner container:

```dockerfile
# Install Node.js for Lighthouse
RUN apt-get update && apt-get install -y nodejs npm
RUN npm install -g lighthouse chrome-launcher
```

### Step 2: Copy Lighthouse Configs

Copy custom configs from Node.js backend:

```dockerfile
COPY ../my-app/services/load_and_audit/custom-config.js /app/lighthouse-configs/
COPY ../my-app/services/load_and_audit/custom-config-lite.js /app/lighthouse-configs/
```

### Step 3: Update Python Scanner

Modify `scanner_service.py` to use Lighthouse when available:

```python
from lighthouse_integration import run_lighthouse_with_camoufox

async def perform_accessibility_audit(page, url: str, is_lite: bool = False):
    # Option A: Use Lighthouse (if available)
    try:
        report = await run_lighthouse_with_camoufox(
            page=page,
            url=url,
            config_path='/app/lighthouse-configs/custom-config.js',
            device=device,
            is_lite=is_lite
        )
        return report
    except Exception as e:
        print(f"⚠️ Lighthouse failed, falling back to custom audits: {e}")
        # Option B: Fall back to current custom audits
        return await perform_custom_audits(page, url, is_lite)
```

## Benefits

1. **Accurate Scores**: Uses Lighthouse's exact audit implementations
2. **Anti-Detection**: Camoufox bypasses bot protection
3. **Backward Compatible**: Falls back to custom audits if Lighthouse unavailable
4. **Best of Both Worlds**: Combines accuracy with reliability

## Testing

1. Test with a protected site (e.g., Cloudflare)
2. Verify Lighthouse audits run successfully
3. Compare scores with old backend
4. Ensure anti-detection still works

## Migration Path

1. **Phase 1**: Implement hybrid approach (current + Lighthouse)
2. **Phase 2**: Test and validate scores match old backend
3. **Phase 3**: Make Lighthouse primary, custom audits as fallback
4. **Phase 4**: Remove custom audits if Lighthouse works perfectly

