# Multi-stage optimized Dockerfile for Ambient Expense-Approval Agent (ADK 2.0)
# Designed for Google Cloud Run (Always Free Tier compatible)

FROM python:3.13-slim as builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir \
    google-adk==2.9.2 \
    google-genai==2.25.0 \
    fastapi==0.141.1 \
    uvicorn==0.49.0 \
    pydantic==2.13.5

# Runtime stage
FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PYTHONPATH=/app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source code
COPY expense_approval/ /app/expense_approval/
COPY static/ /app/static/
COPY app.py /app/app.py

# Non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# Cloud Run injects $PORT environment variable
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
