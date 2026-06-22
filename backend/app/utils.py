"""
Вспомогательные функции
"""

from typing import Optional, List
from fastapi import HTTPException
from app.config import settings


def validate_file_extension(filename: Optional[str], allowed: Optional[List[str]] = None) -> None:
    """
    Проверяет расширение файла.
    Выбрасывает HTTPException 400 при несовпадении.
    """
    if not filename:
        raise HTTPException(status_code=400, detail="Имя файла не указано")

    allowed = allowed or settings.ALLOWED_EXTENSIONS
    ext = "." + filename.split(".")[-1].lower() if "." in filename else ""

    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Недопустимый тип файла: {ext}. Разрешены: {', '.join(allowed)}"
        )
