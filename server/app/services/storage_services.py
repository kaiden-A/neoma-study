"""Cloudflare R2 (S3-compatible) object storage.

Only object keys live in the database. Bytes go straight through the API on
upload (no bucket CORS needed); previews use short-lived presigned GETs so a
URL never outlives one page render.
"""

import contextlib
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from ..config import Settings, get_settings
from .errors import UnavailableError

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
        # Deleting a blob that is already gone is not worth failing a request.
        with contextlib.suppress(BotoCoreError, ClientError):
            self.client().delete_object(Bucket=self.bucket, Key=key)

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


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = Storage(get_settings())
    return _storage
