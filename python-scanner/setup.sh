#!/bin/bash
# Setup script for Python Scanner Service

echo "🐍 Setting up Python Scanner Service for SilverSurfers..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Found Python $PYTHON_VERSION"

# Install dependencies
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

# Download Camoufox browser
echo "🦊 Downloading Camoufox browser..."
camoufox fetch || python3 -m camoufox fetch

echo "✅ Setup complete!"
echo ""
echo "To run the service:"
echo "  python3 scanner_service.py"
echo ""
echo "Or using uvicorn:"
echo "  uvicorn scanner_service:app --host 0.0.0.0 --port 8001"

