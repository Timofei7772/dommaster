"""Company-scoped persistence and identity matching for CRM clients."""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client


class AmbiguousClientMatchError(Exception):
    """Raised when contact details identify more than one client."""


def _normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("8"):
        digits = f"7{digits[1:]}"
    return digits or None


def _normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().casefold()
    return normalized or None


class ClientRepository:
    """Read and write customers within one company."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, *, company_id: int, **data) -> Client:
        client = Client(company_id=company_id, **data)
        self.session.add(client)
        await self.session.flush()
        return client

    async def get_by_id(self, client_id: int, company_id: int) -> Client | None:
        result = await self.session.execute(
            select(Client).where(
                Client.id == client_id,
                Client.company_id == company_id,
            )
        )
        return result.scalar_one_or_none()

    async def find_match(
        self,
        *,
        company_id: int,
        phone: str | None,
        email: str | None,
    ) -> Client | None:
        normalized_phone = _normalize_phone(phone)
        normalized_email = _normalize_email(email)
        if normalized_phone is None and normalized_email is None:
            return None

        result = await self.session.execute(
            select(Client).where(Client.company_id == company_id).order_by(Client.id)
        )
        clients = list(result.scalars().all())
        matches = {
            client
            for client in clients
            if (
                normalized_phone is not None
                and _normalize_phone(client.phone) == normalized_phone
            )
            or (
                normalized_email is not None
                and _normalize_email(client.email) == normalized_email
            )
        }

        if len(matches) > 1:
            raise AmbiguousClientMatchError(
                "Phone and email identify different clients in this company"
            )
        return next(iter(matches), None)
