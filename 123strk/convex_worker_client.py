"""Thin HTTP client for the Convex worker gateway."""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import requests


class ConvexWorkerClient:
    def __init__(self, base_url: Optional[str] = None, shared_secret: Optional[str] = None):
        self.base_url = base_url or os.getenv("CONVEX_WORKER_URL", "").rstrip("/")
        self.shared_secret = shared_secret or os.getenv("WORKER_SHARED_SECRET", "")

        if not self.base_url:
            raise ValueError("CONVEX_WORKER_URL must point to the Convex /worker HTTP endpoint")
        if not self.shared_secret:
            raise ValueError("WORKER_SHARED_SECRET is required")

    def call(self, command: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        response = requests.post(
            self.base_url,
            json={"command": command, "payload": payload or {}},
            headers={
                "Authorization": f"Bearer {self.shared_secret}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
