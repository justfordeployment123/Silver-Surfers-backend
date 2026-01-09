# Fix for Lighthouse Module Not Found Error

## Problem
Lighthouse was installed globally but Node.js couldn't find it when running the script.

## Solution
Changed to local installation using `package.json`:

1. ✅ Created `package.json` with Lighthouse dependencies
2. ✅ Updated Dockerfile to install locally instead of globally
3. ✅ Updated `lighthouse_integration.py` to set NODE_PATH correctly

## What Changed

### Before:
```dockerfile
RUN npm install -g lighthouse@latest chrome-launcher@latest
```

### After:
```dockerfile
COPY package.json .
RUN npm install --production
```

And in `lighthouse_integration.py`:
- Added `NODE_PATH` environment variable
- Set `cwd` to script directory so node_modules is found

## Next Steps

**Rebuild the Docker image:**
```bash
docker-compose build python-scanner
```

**Restart the service:**
```bash
docker-compose up -d python-scanner
```

The Lighthouse module should now be found correctly!

