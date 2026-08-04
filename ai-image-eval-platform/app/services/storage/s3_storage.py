from __future__ import annotations

import asyncio

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.config.settings import get_settings
from app.core.exceptions import StorageError
from app.services.storage.base import StorageService


class S3StorageService(StorageService):
    """MinIO / S3-compatible storage for production. Same interface as LocalStorageService."""

    def __init__(self) -> None:
        settings = get_settings()
        self.bucket = settings.s3_bucket_name
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            use_ssl=settings.s3_use_ssl,
            config=Config(signature_version="s3v4"),
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    async def save(self, key: str, content: bytes, content_type: str) -> str:
        try:
            await asyncio.to_thread(
                self.client.put_object,
                Bucket=self.bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
            return key
        except ClientError as exc:
            raise StorageError(f"Failed to upload {key}: {exc}") from exc

    async def load(self, key: str) -> bytes:
        try:
            response = await asyncio.to_thread(self.client.get_object, Bucket=self.bucket, Key=key)
            return response["Body"].read()
        except ClientError as exc:
            raise StorageError(f"Object not found: {key}") from exc

    async def delete(self, key: str) -> None:
        try:
            await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)
        except ClientError as exc:
            raise StorageError(f"Failed to delete {key}: {exc}") from exc

    async def get_url(self, key: str, expires_seconds: int = 3600) -> str:
        return await asyncio.to_thread(
            self.client.generate_presigned_url,
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )
