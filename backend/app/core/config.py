"""Application configuration loaded from environment / .env."""
from __future__ import annotations

import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    # App
    app_name: str = "Aarogya AI — Smart Hospital Platform"
    app_version: str = "0.1.0"
    environment: str = "development"

    # Data
    database_url: str = "sqlite:///./smart_hospital.db"

    # AI / Ollama (optional — deterministic fallback if unavailable)
    ai_enabled: bool = True
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    gemini_api_key: str | None = None
    grok_api_key: str | None = None
    grok_api: str | None = None
    ai_timeout_seconds: float = 20.0

    # Security
    jwt_secret: str = "dev-secret-change-me"

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def cors_origin_list(self) -> list[str]:
        value = self.cors_origins.strip()
        if not value:
            return []
        if value.startswith("["):
            parsed = json.loads(value)
            return [str(origin).strip() for origin in parsed if str(origin).strip()]
        return [origin.strip() for origin in value.split(",") if origin.strip()]


settings = Settings()
