# Changelog

## Version 1.0.0 - Camoufox Integration

### Changed
- **Replaced Playwright + stealth plugins with Camoufox**
  - Now uses `camoufox[geoip]` package instead of `playwright` and `playwright-stealth`
  - Camoufox automatically handles all fingerprinting and anti-detection
  - Simpler API - no need to manually configure stealth settings

### Benefits
- ✅ Better anti-detection (automatic fingerprint generation)
- ✅ Cleaner code (less manual configuration)
- ✅ More reliable bypass of bot protection
- ✅ Automatic device characteristic generation (OS, CPU, navigator, fonts, headers, etc.)

### Installation Changes
- Old: `playwright install chromium`
- New: `camoufox fetch`

### API Changes
- Old: Manual Playwright setup with stealth plugins
- New: Simple `Camoufox()` context manager

