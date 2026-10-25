from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Hilal OMR Worker"
    app_version: str = "0.1.0"
    host: str = "0.0.0.0"
    port: int = 8000
    max_upload_size_mb: int = 25
    omr_question_count: int = 150
    omr_choice_count: int = 5


settings = Settings()
