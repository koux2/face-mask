#!/bin/bash

# Configuration
SERVICE_NAME="face-mask"
REGION="asia-northeast1" # Tokyo

echo "🚀 Deploying $SERVICE_NAME to Google Cloud Run ($REGION)..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed."
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check authentication
echo "Checking authentication..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo "⚠️  You are not logged in."
    echo "Please run: gcloud auth login"
    exit 1
fi

# Deploy
echo "Building and deploying... (This may take a few minutes)"
gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 2 \
    --cpu-boost \
    --port 8080

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed."
fi
