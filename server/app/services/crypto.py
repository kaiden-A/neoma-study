"""Shared secret encryption for integration tokens.

The key is derived from APP_SECRET plus a purpose string, so a Google refresh
token and an iTa'leem web-service token never share key material. Rotating
APP_SECRET intentionally forces every integration to reconnect.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from ..config import get_settings


def _fernet(purpose: str) -> Fernet:
    digest = hashlib.sha256(f"neoma-{purpose}:{get_settings().app_secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str, purpose: str) -> str:
    return _fernet(purpose).encrypt(value.encode()).decode()


def decrypt_secret(value: str | None, purpose: str) -> str | None:
    if not value:
        return None
    try:
        return _fernet(purpose).decrypt(value.encode()).decode()
    except InvalidToken:
        return None
