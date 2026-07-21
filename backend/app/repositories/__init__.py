"""Persistence boundaries for application modules."""

from app.repositories.client_repository import (
    AmbiguousClientMatchError,
    ClientRepository,
)
from app.repositories.lead_repository import LeadRepository

__all__ = [
    "AmbiguousClientMatchError",
    "ClientRepository",
    "LeadRepository",
]
