import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Base Storage Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    AUDIO_CACHE_DIR: Path = DATA_DIR / "audio_cache"
    PDF_STORAGE_DIR: Path = DATA_DIR / "pdf_prescriptions"

    # Retention Policies
    STORAGE_RETENTION_HOURS: int = 48         # Time-to-Live for audio and PDF files
    CLEANUP_INTERVAL_SECONDS: int = 3600      # Daemon sweep frequency (1 hour)
    AUDIO_CACHE_MAX_SIZE_MB: int = 500        # Hard directory limit for audio artifacts
    PDF_STORAGE_MAX_SIZE_MB: int = 250        # Hard directory limit for generated PDFs

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()