from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GNANI_API_KEY: str = ""
    GNANI_PRISMA_URL: str = "wss://api.gnani.ai/v1/stt"
    GNANI_EVON_URL: str = "https://api.gnani.ai/v1/evon"
    GNANI_TIMBRE_URL: str = "https://api.gnani.ai/v1/tts"
    
    class Config:
        env_file = ".env"

settings = Settings()