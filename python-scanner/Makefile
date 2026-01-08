# Makefile for Python Scanner Service

.PHONY: build run stop logs test clean help

# Default values
IMAGE_NAME=silversurfers-python-scanner
CONTAINER_NAME=python-scanner
PORT=8001

help:
	@echo "Available commands:"
	@echo "  make build      - Build Docker image"
	@echo "  make run        - Run Docker container"
	@echo "  make stop       - Stop Docker container"
	@echo "  make logs       - View container logs"
	@echo "  make test       - Test the service"
	@echo "  make clean      - Remove container and image"
	@echo "  make compose-up - Start with docker-compose"
	@echo "  make compose-down - Stop docker-compose"

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run -d \
		--name $(CONTAINER_NAME) \
		-p $(PORT):8001 \
		-e TEMP_DIR=/tmp \
		$(IMAGE_NAME)

stop:
	docker stop $(CONTAINER_NAME)
	docker rm $(CONTAINER_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)

test:
	@echo "Testing health endpoint..."
	@curl -s http://localhost:$(PORT)/health | python3 -m json.tool
	@echo "\nTesting audit endpoint..."
	@curl -s -X POST http://localhost:$(PORT)/audit \
		-H "Content-Type: application/json" \
		-d '{"url":"https://example.com","device":"desktop","format":"json","isLiteVersion":false}' \
		| python3 -m json.tool | head -20

clean:
	docker stop $(CONTAINER_NAME) 2>/dev/null || true
	docker rm $(CONTAINER_NAME) 2>/dev/null || true
	docker rmi $(IMAGE_NAME) 2>/dev/null || true

compose-up:
	docker-compose up -d

compose-down:
	docker-compose down

compose-logs:
	docker-compose logs -f


