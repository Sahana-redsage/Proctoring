from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str

    R2_ENDPOINT: str
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_BUCKET_NAME: str
    R2_PUBLIC_URL: str

    CHUNK_DURATION_SEC: int = 20
    BATCH_SIZE: int = 5

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"   # 🔥 THIS FIXES YOUR ERROR
    )

settings = Settings()
