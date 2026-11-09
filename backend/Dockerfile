# Use official slim Python runtime
FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system-level audio dependencies (ffmpeg is strictly required by pydub)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/app/data/audio_cache /app/app/data/pdf_prescriptions

# Expose FastAPI listening port
EXPOSE 8000

# Start Uvicorn bound to 0.0.0.0
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]