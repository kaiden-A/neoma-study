"""Cloudflare R2 (S3-compatible) object storage.

Only object keys live in the database. Bytes go straight through the API on
upload (no bucket CORS needed); previews use short-lived presigned GETs so a
URL never outlives one page render.
"""

import logging
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from ..config import Settings, get_settings
from .errors import UnavailableError

log = logging.getLogger(__name__)

UPLOAD_ERROR = "Could not store that file. Try again."


class StorageError(RuntimeError):
    pass


class Storage:
    """Thin wrapper so tests can swap in a fake."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Any = None

    @property
    def configured(self) -> bool:
        return self._settings.storage_configured

    @property
    def bucket(self) -> str:
        return self._settings.r2_bucket

    def client(self) -> Any:
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self._settings.r2_endpoint,
                aws_access_key_id=self._settings.r2_access_key_id,
                aws_secret_access_key=self._settings.r2_secret_access_key,
                region_name="auto",
                config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
            )
        return self._client

    def put(self, key: str, data: bytes, content_type: str) -> None:
        if not self.configured:
            raise UnavailableError("File storage is not configured.")
        try:
            self.client().put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        except (BotoCoreError, ClientError) as exc:
            raise StorageError(UPLOAD_ERROR) from exc

    def delete(self, key: str | None) -> None:
        if not key or not self.configured:
            return
        # Best-effort: a missing blob is fine, but a rejected delete must not
        # vanish - the DB row goes regardless, so log it or the key leaks.
        try:
            self.client().delete_object(Bucket=self.bucket, Key=key)
        except (BotoCoreError, ClientError) as exc:
            log.warning("R2 delete failed for %s: %s", key, exc)

    def copy(self, source_key: str, dest_key: str) -> None:
        """Server-side copy, so sharing a note never re-uploads its bytes."""
        if not self.configured:
            raise UnavailableError("File storage is not configured.")
        try:
            self.client().copy_object(
                Bucket=self.bucket,
                CopySource={"Bucket": self.bucket, "Key": source_key},
                Key=dest_key,
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError("Could not copy that file.") from exc

    def presigned_get(self, key: str) -> str:
        if not self.configured:
            raise UnavailableError("File storage is not configured.")
        try:
            return self.client().generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=self._settings.r2_signed_url_ttl_seconds,
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError("Could not prepare that file.") from exc

    def presigned_put(self, key: str, content_type: str) -> str:
        """A short-lived URL the browser PUTs bytes to; the API never sees them."""
        if not self.configured:
            raise UnavailableError("File storage is not configured.")
        try:
            return self.client().generate_presigned_url(
                "put_object",
                Params={"Bucket": self.bucket, "Key": key, "ContentType": content_type},
                ExpiresIn=self._settings.r2_signed_url_ttl_seconds,
            )
        except (BotoCoreError, ClientError) as exc:
            raise StorageError("Could not prepare that upload.") from exc

    def head(self, key: str) -> int | None:
        """The stored object's size, or None when it was never uploaded."""
        if not self.configured:
            raise UnavailableError("File storage is not configured.")
        try:
            response = self.client().head_object(Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = str((exc.response.get("Error") or {}).get("Code") or "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise StorageError(UPLOAD_ERROR) from exc
        except BotoCoreError as exc:
            raise StorageError(UPLOAD_ERROR) from exc
        return int(response.get("ContentLength") or 0)


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = Storage(get_settings())
    return _storage
