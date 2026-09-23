#!/usr/bin/env bash
# ==============================================================================
# Google Cloud Platform (GCP) Cloud Run Deployment Script
# Always Free Tier Configuration: Scales to 0 when idle ($0.00 cost)
# ==============================================================================

set -e

SERVICE_NAME="ambient-expense-agent"
REGION="us-central1"

echo "======================================================================"
echo "  Google Cloud Run Deployment - Ambient Expense Approval Agent"
echo "  Tier: Google Cloud Always Free Tier"
echo "  - Requests: Up to 2,000,000 / month (100% Free)"
echo "  - vCPU: Up to 360,000 vCPU-seconds / month (100% Free)"
echo "  - Memory: Up to 180,000 GiB-seconds / month (100% Free)"
echo "  - Scale to zero: min-instances=0 (Zero idle cost)"
echo "======================================================================"

# 1. Check for gcloud CLI
if ! command -v gcloud &> /dev/null; then
    echo ""
    echo "⚠️  'gcloud' CLI was not found on your system."
    echo ""
    echo "To deploy to Google Cloud Platform:"
    echo "1. Install Google Cloud SDK:"
    echo "   brew install --cask google-cloud-sdk"
    echo "   (or download from: https://cloud.google.com/sdk/docs/install)"
    echo ""
    echo "2. Authenticate with your Google account:"
    echo "   gcloud auth login"
    echo ""
    echo "3. Set your active GCP project (ensure billing account is attached):"
    echo "   gcloud config set project YOUR_PROJECT_ID"
    echo ""
    echo "4. Re-run this script: ./deploy_gcp.sh"
    exit 1
fi

# 2. Verify GCP Project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [ -z "$CURRENT_PROJECT" ] || [ "$CURRENT_PROJECT" == "(unset)" ]; then
    echo "⚠️  No active GCP project is set. Please run:"
    echo "   gcloud config set project <YOUR_PROJECT_ID>"
    exit 1
fi

echo "Current GCP Project: ${CURRENT_PROJECT}"
echo "Target Region:       ${REGION}"
echo ""

# 3. Enable Required Google Cloud APIs
echo "Enabling Cloud Run and Cloud Build APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 4. Deploy to Google Cloud Run
echo "Deploying ${SERVICE_NAME} to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
    --source . \
    --region "${REGION}" \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 2 \
    --memory 512Mi \
    --cpu 1 \
    --set-env-vars="PORT=8080"

echo ""
echo "✅ Deployment complete! Your service is live on Google Cloud Run."
gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format="value(status.url)"
