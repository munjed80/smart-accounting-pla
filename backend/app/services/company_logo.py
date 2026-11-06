"""Validate and normalize company logos before they enter profile storage."""

import base64
import binascii
from io import BytesIO

from PIL import Image, ImageOps

LOGO_DATA_PREFIX = "data:image/png;base64,"
MAX_LOGO_BYTES = 600 * 1024
MAX_LOGO_DATA_LENGTH = 4 * ((MAX_LOGO_BYTES + 2) // 3) + 32
SUPPORTED_LOGOS = {"data:image/png;base64": "PNG", "data:image/jpeg;base64": "JPEG"}


def normalize_company_logo(value: str | None) -> str | None:
    if value is None:
        return None

    prefix, _, encoded = value.partition(",")
    image_format = SUPPORTED_LOGOS.get(prefix)
    if not image_format:
        raise ValueError("Kies een PNG- of JPEG-afbeelding.")

    try:
        data = base64.b64decode(encoded, validate=True)
        if len(data) > MAX_LOGO_BYTES:
            raise ValueError("Het bedrijfslogo mag maximaal 600 KB zijn.")

        with Image.open(BytesIO(data), formats=[image_format]) as image:
            if image.width > 4096 or image.height > 4096 or image.width * image.height > 8_000_000:
                raise ValueError("Het bedrijfslogo heeft te veel pixels.")
            if getattr(image, "n_frames", 1) != 1:
                raise ValueError("Kies een afbeelding zonder animatie.")
            normalized = ImageOps.exif_transpose(image).convert("RGBA")
            normalized.thumbnail((384, 384), Image.Resampling.LANCZOS)
            output = BytesIO()
            # A fresh image strips EXIF, color profiles and other uploaded metadata.
            clean = Image.frombytes("RGBA", normalized.size, normalized.tobytes())
            clean.save(output, format="PNG")
    except (binascii.Error, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Het bedrijfslogo kan niet worden gelezen.") from exc

    return LOGO_DATA_PREFIX + base64.b64encode(output.getvalue()).decode("ascii")
