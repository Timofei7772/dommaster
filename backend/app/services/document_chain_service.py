"""Business workflow from immutable estimate revisions to legal documents."""

import hashlib
import json
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contract import ContractStatus, ContractType
from app.repositories.document_workflow_repository import (
    DocumentWorkflowRepository,
)


class DocumentChainError(Exception):
    """Base error for persistent document-chain commands."""


class DocumentChainNotFoundError(DocumentChainError):
    """Raised when a source is absent from the active company."""


class InvalidSourceRevisionError(DocumentChainError):
    """Raised when a document is requested from an unapproved source."""


class DocumentChainIdempotencyConflictError(DocumentChainError):
    """Raised when an idempotency key is reused for another command."""


def _canonical_hash(payload: dict) -> str:
    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _number(value) -> str:
    decimal_value = Decimal(str(value if value is not None else 0))
    if decimal_value == 0:
        return "0"
    return format(decimal_value.normalize(), "f")


class DocumentChainService:
    """Create operational records and immutable source snapshots together."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        repository: DocumentWorkflowRepository | None = None,
    ):
        self.session = session
        self.repository = repository or DocumentWorkflowRepository(session)

    async def create_contract(
        self,
        *,
        estimate_revision_id: int,
        company_id: int,
        actor_id: int | None,
        contract_data: dict,
        idempotency_key: str,
    ):
        existing_snapshot = (
            await self.repository.get_snapshot_by_idempotency_key(
                company_id=company_id,
                idempotency_key=idempotency_key,
            )
        )
        if existing_snapshot is not None:
            if (
                existing_snapshot.document_type != "contract"
                or existing_snapshot.estimate_revision_id != estimate_revision_id
            ):
                raise DocumentChainIdempotencyConflictError(
                    "Idempotency key belongs to another document command"
                )
            contract = await self.repository.get_contract(
                existing_snapshot.entity_id
            )
            if contract is None:
                raise DocumentChainNotFoundError(
                    "Idempotent contract record is missing"
                )
            return contract

        revision = await self.repository.get_revision(
            revision_id=estimate_revision_id,
            company_id=company_id,
        )
        if revision is None:
            raise DocumentChainNotFoundError(
                f"Estimate revision {estimate_revision_id} was not found"
            )

        source = revision.payload_json
        if source.get("estimate", {}).get("status") != "approved":
            raise InvalidSourceRevisionError(
                "Contract requires an approved estimate revision"
            )
        if _canonical_hash(source) != revision.payload_hash:
            raise InvalidSourceRevisionError(
                "Estimate revision payload integrity check failed"
            )

        customer = source["parties"]["customer"]
        project = source["project"]
        project_object = source["object"]
        total_amount = source["totals"]["total_with_vat"]
        contract_type = self._resolve_contract_type(
            contract_data.get("contract_type"),
            customer,
        )

        contract = await self.repository.create_contract(
            number=contract_data["number"],
            contract_date=contract_data["contract_date"],
            start_date=contract_data.get("start_date"),
            end_date=contract_data.get("end_date"),
            contract_type=contract_type,
            status=ContractStatus.DRAFT,
            customer_name=customer["name"],
            customer_address=customer.get("legal_address"),
            customer_inn=customer.get("inn"),
            customer_kpp=customer.get("kpp"),
            customer_phone=customer.get("phone"),
            customer_email=customer.get("email"),
            customer_bank=customer.get("bank_name"),
            customer_bik=customer.get("bik"),
            customer_account=customer.get("checking_account"),
            customer_corr_account=customer.get("corr_account"),
            object_name=project_object.get("name"),
            object_address=project_object.get("address"),
            total_amount=float(Decimal(total_amount)),
            advance_amount=float(Decimal(str(contract_data.get("advance_amount", 0)))),
            advance_percent=float(Decimal(str(contract_data.get("advance_percent", 0)))),
            project_id=project["id"],
            notes=contract_data.get("notes"),
        )

        snapshot_payload = {
            "schema_version": "contract-snapshot.v1",
            "source": {
                "estimate_revision_id": revision.id,
                "estimate_revision_number": revision.revision_number,
                "estimate_revision_hash": revision.payload_hash,
            },
            "contract": {
                "id": contract.id,
                "number": contract.number,
                "contract_date": contract.contract_date.isoformat(),
                "start_date": (
                    contract.start_date.isoformat() if contract.start_date else None
                ),
                "end_date": (
                    contract.end_date.isoformat() if contract.end_date else None
                ),
                "type": contract.contract_type.value,
                "status": contract.status.value,
                "project_id": contract.project_id,
                "customer": customer,
                "object": project_object,
                "total_amount": _number(total_amount),
                "advance_amount": _number(contract.advance_amount),
                "advance_percent": _number(contract.advance_percent),
                "notes": contract.notes,
            },
        }
        snapshot = await self.repository.create_snapshot(
            company_id=company_id,
            project_id=project["id"],
            estimate_revision_id=revision.id,
            document_type="contract",
            entity_id=contract.id,
            version=1,
            status=ContractStatus.DRAFT.value,
            payload_json=snapshot_payload,
            payload_hash=_canonical_hash(snapshot_payload),
            template_version="contract.v1",
            idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        await self.repository.create_audit_event(
            snapshot_id=snapshot.id,
            company_id=company_id,
            actor_id=actor_id,
            previous_status=None,
            new_status=ContractStatus.DRAFT.value,
            reason="Created from approved estimate revision",
        )
        return contract

    @staticmethod
    def _resolve_contract_type(value, customer: dict) -> ContractType:
        if value is not None:
            return value if isinstance(value, ContractType) else ContractType(value)
        if customer.get("client_type") == "company" or customer.get("inn"):
            return ContractType.LEGAL_ENTITY
        return ContractType.INDIVIDUAL
