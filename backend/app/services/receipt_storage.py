"""Validated receipt evidence stored under its administration and document UUID."""

from io import BytesIO
from pathlib import Path
import re
import warnings

import aiofiles
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.models.zzp import ZZPDocument, ZZPDocType, ZZPDocStatus


def _image_type(content: bytes) -> tuple[str, str]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                kind = image.format
                if image.width * image.height > 20_000_000:
                    raise ValueError("Receipt resolution is too large")
                if kind not in ("PNG", "JPEG", "WEBP"):
                    raise ValueError("Unsupported receipt image")
                image.verify()
            with Image.open(BytesIO(content)) as decoded:
                decoded.load()
        return {
            "PNG": ("image/png", "png"),
            "JPEG": ("image/jpeg", "jpg"),
            "WEBP": ("image/webp", "webp"),
        }[kind]
    except (
        ValueError,
        OSError,
        EOFError,
        SyntaxError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(
            400,
            detail={
                "code": "INVALID_RECEIPT",
                "message": "Upload een geldige JPEG-, PNG- of WebP-afbeelding.",
            },
        ) from exc


async def save_receipt(db, administration_id, user_id, file: UploadFile) -> ZZPDocument:
    try:
        content = await file.read(settings.MAX_UPLOAD_SIZE + 1)
    finally:
        await file.close()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            413,
            detail={"code": "FILE_TOO_LARGE", "message": "Het bestand is te groot."},
        )
    mime, extension = await run_in_threadpool(_image_type, content)
    filename = re.sub(
        r"[\x00-\x1f\x7f]",
        "",
        (file.filename or "bonnetje").replace("\\", "/").split("/")[-1],
    )[:230]
    doc = ZZPDocument(
        administration_id=administration_id,
        user_id=user_id,
        filename=filename or f"bonnetje.{extension}",
        mime_type=mime,
        storage_ref="",
        doc_type=ZZPDocType.BON,
        status=ZZPDocStatus.NEW,
    )
    db.add(doc)
    await db.flush()
    directory = Path(settings.UPLOAD_DIR) / "zzp" / str(administration_id) / str(doc.id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"original.{extension}"
    try:
        async with aiofiles.open(path, "xb") as stream:
            await stream.write(content)
        doc.storage_ref = str(path)
        await db.commit()
    except Exception:
        await db.rollback()
        path.unlink(missing_ok=True)
        raise
    return doc
