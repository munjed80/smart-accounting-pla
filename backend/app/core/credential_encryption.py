"""
Credential encryption helpers for e-commerce integrations.

Uses Fernet symmetric encryption with the app's SECRET_KEY to
encrypt/decrypt API credentials stored in the database.
"""
import base64
import hashlib
import json
import logging
from typing import Dict, Any

from cryptography.fernet import Fernet

from app.core.config import settings

logger = logging.getLogger(__name__)


def _derive_key() -> bytes:
    """Derive a 32-byte Fernet key from SECRET_KEY using SHA-256."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_credentials(credentials: Dict[str, Any]) -> str:
    """Encrypt a dict of credentials to a Fernet-encrypted string."""
    key = _derive_key()
    f = Fernet(key)
    plaintext = json.dumps(credentials).encode("utf-8")
    return f.encrypt(plaintext).decode("utf-8")


def decrypt_credentials(encrypted: str) -> Dict[str, Any]:
    """Decrypt a Fernet-encrypted string back to a dict of credentials."""
    key = _derive_key()
    f = Fernet(key)
    plaintext = f.decrypt(encrypted.encode("utf-8"))
    return json.loads(plaintext.decode("utf-8"))
