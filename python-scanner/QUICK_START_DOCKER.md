# Quick Start: Docker Deployment

## 🚀 Fastest Way to Deploy

### Option 1: Docker Compose (Recommended)

```bash
cd backend-silver-surfers/python-scanner

# 1. Copy environment file
cp env.example .env

# 2. Start the service
docker-compose up -d

# 3. Check if it's running
docker-compose ps

# 4. View logs
docker-compose logs -f

# 5. Test the service
curl http://localhost:8001/health
```

### Option 2: Docker Commands

```bash
cd backend-silver-surfers/python-scanner

# 1. Build the image
docker build -t silversurfers-python-scanner .

# 2. Run the container
docker run -d \
  --name python-scanner \
  -p 8001:8001 \
  -e TEMP_DIR=/tmp \
  silversurfers-python-scanner

# 3. Check logs
docker logs -f python-scanner

# 4. Test
curl http://localhost:8001/health
```

### Option 3: Using Makefile

```bash
cd backend-silver-surfers/python-scanner

# Build and run
make build
make run

# View logs
make logs

# Test
make test

# Stop
make stop
```

---

## ✅ Verify It's Working

### 1. Health Check

```bash
curl http://localhost:8001/health
```

Should return:
```json
{
  "status": "healthy",
  "service": "python-scanner"
}
```

### 2. Test Audit

```bash
curl -X POST http://localhost:8001/audit \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "device": "desktop",
    "format": "json",
    "isLiteVersion": false
  }'
```

---

## 🔧 Environment Variables

Create a `.env` file:

```bash
PORT=8001
HOST=0.0.0.0
TEMP_DIR=/tmp
PYTHON_SCANNER_URL=http://localhost:8001
LIMIT_CONCURRENCY=10
TIMEOUT_KEEP_ALIVE=300
```

---

## 📝 Next Steps

1. **Update Node.js** to use the Docker service:
   ```bash
   # In Node.js .env file
   PYTHON_SCANNER_URL=http://localhost:8001
   ```

2. **Test integration** with Node.js

3. **Monitor logs** for any issues

For detailed documentation, see `DOCKER.md`


