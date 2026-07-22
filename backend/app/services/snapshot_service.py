"""Canonical immutable snapshots for approved estimate revisions."""

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.estimate import Estimate, EstimateStatus
from app.repositories.document_workflow_repository import (
    DocumentWorkflowRepository,
)


class SnapshotError(Exception):
    """Base error for estimate snapshot commands."""


class SnapshotNotFoundError(SnapshotError):
    """Raised when the estimate is absent from the active company."""


class SnapshotIdempotencyConflictError(SnapshotError):
    """Raised when one key is reused for a different estimate command."""


def _number(value) -> str:
    decimal_value = Decimal(str(value if value is not None else 0))
    if decimal_value == 0:
        return "0"
    return format(decimal_value.normalize(), "f")


def _canonical_hash(payload: dict) -> str:
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class SnapshotService:
    """Approve estimates by freezing their complete business input."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        repository: DocumentWorkflowRepository | None = None,
    ):
        self.session = session
        self.repository = repository or DocumentWorkflowRepository(session)

    async def approve_estimate(
        self,
        *,
        estimate_id: int,
        company_id: int,
        actor_id: int | None,
        idempotency_key: str,
    ):
        existing = await self.repository.get_revision_by_idempotency_key(
            company_id=company_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            if existing.estimate_id != estimate_id:
                raise SnapshotIdempotencyConflictError(
                    "Idempotency key belongs to another estimate"
                )
            return existing

        estimate = await self.repository.get_estimate_for_approval(
            estimate_id=estimate_id,
            company_id=company_id,
        )
        if estimate is None:
            raise SnapshotNotFoundError(f"Estimate {estimate_id} was not found")

        approved_at = datetime.now(timezone.utc)
        payload = self._serialize_estimate(estimate)
        revision = await self.repository.create_revision(
            company_id=company_id,
            estimate_id=estimate.id,
            revision_number=await self.repository.next_revision_number(
                estimate_id=estimate.id
            ),
            payload_json=payload,
            payload_hash=_canonical_hash(payload),
            idempotency_key=idempotency_key,
            created_by=actor_id,
            approved_at=approved_at,
        )
        estimate.status = EstimateStatus.APPROVED
        estimate.approved_at = approved_at
        estimate.approved_by = actor_id
        await self.session.flush()
        return revision

    @staticmethod
    def _serialize_estimate(estimate: Estimate) -> dict:
        project = estimate.project
        client = project.client
        company = project.company
        project_object = estimate.object

        sections = sorted(
            estimate.sections,
            key=lambda section: (
                section.order_index if section.order_index is not None else 0,
                section.id,
            ),
        )
        section_order = {
            section.id: position
            for position, section in enumerate(sections)
        }
        rows = sorted(
            estimate.items,
            key=lambda row: (
                section_order.get(row.section_id, len(section_order)),
                row.order_index if row.order_index is not None else 0,
                row.id,
            ),
        )

        return {
            "schema_version": "estimate-snapshot.v1",
            "calculation_schema_version": "smeta-2007.v1",
            "estimate": {
                "id": estimate.id,
                "number": estimate.number,
                "name": estimate.name,
                "description": estimate.description,
                "type": (
                    estimate.estimate_type.value
                    if estimate.estimate_type is not None
                    else None
                ),
                "status": EstimateStatus.APPROVED.value,
            },
            "project": {
                "id": project.id,
                "code": project.code,
                "name": project.name,
                "description": project.description,
            },
            "object": {
                "id": project_object.id if project_object else None,
                "code": project_object.code if project_object else None,
                "name": project_object.name if project_object else None,
                "address": project_object.address if project_object else None,
            },
            "parties": {
                "customer": {
                    "id": client.id if client else None,
                    "name": client.name if client else project.customer_name,
                    "inn": client.inn if client else None,
                    "kpp": client.kpp if client else None,
                    "legal_address": client.legal_address if client else None,
                    "bank_name": client.bank_name if client else None,
                    "bik": client.bik if client else None,
                    "checking_account": client.checking_account if client else None,
                    "corr_account": client.corr_account if client else None,
                },
                "contractor": {
                    "id": company.id,
                    "name": company.name,
                    "bank_details": company.bank_details,
                },
            },
            "coefficients": {
                "work": _number(estimate.work_coef),
                "material": _number(estimate.material_coef),
                "overhead_percent": _number(estimate.overhead_percent),
                "profit_percent": _number(estimate.profit_percent),
                "price_index": _number(estimate.price_index),
            },
            "vat": {
                "percent": _number(estimate.vat_percent),
                "on_top": bool(estimate.vat_on_top),
                "amount": _number(estimate.vat_cost),
            },
            "totals": {
                "labor": _number(estimate.labor_cost),
                "materials": _number(estimate.materials_cost),
                "machines": _number(estimate.machines_cost),
                "overhead": _number(estimate.overhead_cost),
                "profit": _number(estimate.profit_cost),
                "total_without_vat": _number(estimate.total_cost),
                "total_with_vat": _number(estimate.total_with_vat),
            },
            "sections": [
                {
                    "source_id": section.id,
                    "number": section.number,
                    "name": section.name,
                    "order_index": section.order_index,
                    "total": _number(section.total_cost),
                }
                for section in sections
            ],
            "rows": [
                {
                    "source_id": row.id,
                    "section_source_id": row.section_id,
                    "item_number": row.item_number,
                    "order_index": row.order_index,
                    "justification": row.justification,
                    "name": row.name,
                    "description": row.description,
                    "unit": row.unit,
                    "quantity": _number(row.quantity),
                    "quantity_expression": row.quantity_expr,
                    "row_type": row.row_type,
                    "materials_unit_price": _number(row.materials_price),
                    "labor_unit_price": _number(row.labor_price),
                    "machines_unit_price": _number(row.machines_price),
                    "materials_total": _number(row.materials_total),
                    "labor_total": _number(row.labor_total),
                    "machines_total": _number(row.machines_total),
                    "total": _number(row.total),
                }
                for row in rows
            ],
        }
