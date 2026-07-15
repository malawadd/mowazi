from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "local"
    service_name: str = "moeazi-agent-service"
    api_host: str = "0.0.0.0"
    api_port: int = 8100
    worker_shared_secret: SecretStr = SecretStr("local-only-change-me")
    convex_worker_url: str = "http://host.docker.internal:3000/worker"
    temporal_address: str = "temporal:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "moeazi-analysis"
    postgres_dsn: str = "postgresql+asyncpg://postgres:postgres@timescaledb:5432/moeazi"
    redis_url: str = "redis://redis:6379/0"
    otel_exporter_otlp_endpoint: str = ""

    openai_api_key: SecretStr = SecretStr("")
    deepseek_api_key: SecretStr = SecretStr("")
    deepseek_base_url: str = "https://api.deepseek.com"
    openai_specialist_model: str = "gpt-5.4-mini"
    openai_synthesis_model: str = "gpt-5.6-sol"
    deepseek_specialist_model: str = "deepseek-v4-flash"
    deepseek_synthesis_model: str = "deepseek-v4-pro"
    provider_timeout_seconds: float = 45.0
    provider_max_concurrency: int = Field(default=40, ge=1, le=500)
    provider_retries: int = Field(default=2, ge=0, le=5)

    quicknode_stream_url: str = ""
    cryptopanic_api_key: SecretStr = SecretStr("")
    x_bearer_token: SecretStr = SecretStr("")
    uniswap_api_key: SecretStr = SecretStr("")
    uniswap_api_url: str = "https://trade-api.gateway.uniswap.org/v1"
    master_key: SecretStr = SecretStr("")
    live_execution_enabled: bool = False
    certified_venues: str = ""

    @property
    def certified_venue_set(self) -> frozenset[str]:
        return frozenset(item.strip().lower() for item in self.certified_venues.split(",") if item.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
