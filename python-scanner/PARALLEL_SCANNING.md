# Parallel Scanning Configuration

## Overview

The Python scanner service is configured to handle **5 parallel scans** simultaneously. This is achieved through:

1. **FastAPI Async Support**: FastAPI natively supports async/await, allowing concurrent request handling
2. **Uvicorn Configuration**: Configured with `limit_concurrency=10` to allow up to 10 concurrent connections
3. **Node.js Queue Concurrency**: Both `fullAuditQueue` and `quickScanQueue` are set to `concurrency: 5`

## Configuration

### Python Service (scanner_service.py)

```python
uvicorn.run(
    app, 
    host="0.0.0.0", 
    port=8001,
    workers=1,  # Single worker (FastAPI handles async concurrency)
    limit_concurrency=10,  # Allow up to 10 concurrent connections
    timeout_keep_alive=300  # 5 minutes keep-alive for long-running scans
)
```

### Node.js Queues (server.js)

```javascript
fullAuditQueue = new PersistentQueue('FullAudit', runFullAuditProcess, {
  concurrency: 5,  // Allow 5 parallel full audits
  maxRetries: 3,
  retryDelay: 10000
});

quickScanQueue = new PersistentQueue('QuickScan', runQuickScanProcess, {
  concurrency: 5,  // Allow 5 parallel quick scans
  maxRetries: 3,
  retryDelay: 5000
});
```

## How It Works

1. **Node.js Queue**: Processes up to 5 jobs concurrently
2. **Each job** calls Python scanner via HTTP
3. **Python FastAPI**: Handles multiple async requests simultaneously
4. **Camoufox**: Each request launches its own browser instance (isolated)

## Performance Considerations

- **Memory**: Each Camoufox browser instance uses ~100-200MB RAM
  - 5 parallel scans = ~500MB-1GB RAM
- **CPU**: Browser automation is CPU-intensive
  - Monitor CPU usage, may need to reduce concurrency on lower-end servers
- **Network**: Each scan makes HTTP requests
  - Ensure sufficient bandwidth for parallel requests

## Adjusting Concurrency

### Increase Parallel Scans

**Node.js (server.js):**
```javascript
concurrency: 10,  // Increase to 10
```

**Python (scanner_service.py):**
```python
limit_concurrency=20,  # Increase to 20
```

### Decrease for Lower Resources

**Node.js (server.js):**
```javascript
concurrency: 2,  // Reduce to 2
```

**Python (scanner_service.py):**
```python
limit_concurrency=5,  # Reduce to 5
```

## Monitoring

Watch for:
- **Memory usage**: Should stay under available RAM
- **CPU usage**: Should not consistently hit 100%
- **Response times**: Should remain reasonable (< 2 minutes per scan)
- **Failed requests**: Too many failures may indicate overload

## Best Practices

1. **Start with 5**: Good balance for most servers
2. **Monitor first**: Watch resource usage with 5 parallel scans
3. **Scale up gradually**: Increase only if resources allow
4. **Scale down if needed**: Reduce if seeing timeouts or failures

