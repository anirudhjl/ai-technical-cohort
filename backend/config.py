from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731:free"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass(frozen=True)
class Config:
    openrouter_api_key: str | None
    openrouter_model: str
    openrouter_base_url: str

    @property
    def has_llm_key(self) -> bool:
        return bool(self.openrouter_api_key)


def load_config() -> Config:
    return Config(
        openrouter_api_key=os.environ.get("OPENROUTER_API_KEY") or None,
        openrouter_model=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL),
        openrouter_base_url=os.environ.get("OPENROUTER_BASE_URL", DEFAULT_BASE_URL),
    )
