"""Business workflow from immutable estimate revisions to legal documents."""

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contract import ContractStatus, ContractType
from app.models.ks2 import KS2Status
from app.models.ks3 import KS3Status
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


class InvalidDocumentQuantityError(DocumentChainError):
    """Raised when executed quantity is invalid or exceeds the approved source."""


class InvalidDocumentSelectionError(DocumentChainError):
    """Raised when selected source documents are incompatible or unavailable."""


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


def _money(value) -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


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

    async def create_ks2(
        self,
        *,
        estimate_revision_id: int,
        contract_id: int,
        company_id: int,
        actor_id: int | None,
        act_data: dict,
        rows: list[dict],
        idempotency_key: str,
    ):
        existing = await self.repository.get_snapshot_by_idempotency_key(
            company_id=company_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            if (
                existing.document_type != "ks2"
                or existing.estimate_revision_id != estimate_revision_id
            ):
                raise DocumentChainIdempotencyConflictError(
                    "Idempotency key belongs to another document command"
                )
            act = await self.repository.get_ks2(existing.entity_id)
            if act is None:
                raise DocumentChainNotFoundError("Idempotent KS-2 record is missing")
            return act

        revision = await self.repository.get_revision(
            revision_id=estimate_revision_id,
            company_id=company_id,
        )
        if revision is None:
            raise DocumentChainNotFoundError(
                f"Estimate revision {estimate_revision_id} was not found"
            )
        source = revision.payload_json
        if (
            source.get("estimate", {}).get("status") != "approved"
            or _canonical_hash(source) != revision.payload_hash
        ):
            raise InvalidSourceRevisionError("KS-2 requires an intact approved revision")
        contract_snapshot = await self.repository.get_contract_snapshot(
            contract_id=contract_id,
            revision_id=revision.id,
            company_id=company_id,
        )
        if contract_snapshot is None:
            raise DocumentChainNotFoundError(
                "Contract does not belong to the approved revision"
            )
        if not rows:
            raise InvalidDocumentQuantityError("KS-2 requires at least one row")

        source_rows = {row["source_id"]: row for row in source["rows"]}
        if len({row["source_row_id"] for row in rows}) != len(rows):
            raise InvalidDocumentQuantityError("Duplicate KS-2 source rows")
        prior = await self.repository.get_signed_ks2_quantities(
            revision_id=revision.id,
            company_id=company_id,
        )
        prepared_rows = []
        for selection in rows:
            source_row_id = selection["source_row_id"]
            source_row = source_rows.get(source_row_id)
            if source_row is None:
                raise InvalidDocumentQuantityError(
                    f"Row {source_row_id} is absent from the approved revision"
                )
            quantity_done = Decimal(str(selection["quantity_done"]))
            quantity_total = Decimal(source_row["quantity"])
            quantity_prev = Decimal(str(prior.get(source_row_id, 0)))
            if quantity_done <= 0:
                raise InvalidDocumentQuantityError("Executed quantity must be positive")
            if quantity_done + quantity_prev > quantity_total:
                raise InvalidDocumentQuantityError(
                    f"Executed quantity exceeds remaining quantity for row {source_row_id}"
                )
            if quantity_total <= 0:
                raise InvalidDocumentQuantityError("Approved row quantity must be positive")
            unit_price = Decimal(source_row["total"]) / quantity_total
            line_total = _money(quantity_done * unit_price)
            prepared_rows.append((source_row, quantity_done, quantity_prev, unit_price, line_total))

        total_without_vat = _money(sum((row[4] for row in prepared_rows), Decimal("0")))
        vat_percent = Decimal(source["vat"]["percent"])
        vat_amount = (
            _money(total_without_vat * vat_percent / Decimal("100"))
            if source["vat"]["on_top"]
            else Decimal("0")
        )
        total_with_vat = _money(total_without_vat + vat_amount)
        parties = source["parties"]
        project_object = source["object"]
        act = await self.repository.create_ks2(
            number=act_data["number"],
            act_date=act_data["act_date"],
            period_start=act_data["period_start"],
            period_end=act_data["period_end"],
            estimate_id=revision.estimate_id,
            contract_id=contract_id,
            customer=parties["customer"]["name"],
            contractor=parties["contractor"]["name"],
            investor=act_data.get("investor"),
            object_name=project_object.get("name"),
            object_address=project_object.get("address"),
            total_without_vat=float(total_without_vat),
            vat_amount=float(vat_amount),
            total_with_vat=float(total_with_vat),
            status=KS2Status.DRAFT,
        )
        for order_index, prepared in enumerate(prepared_rows, 1):
            source_row, done, previous, unit_price, line_total = prepared
            await self.repository.create_ks2_item(
                act_id=act.id,
                estimate_item_id=source_row["source_id"],
                item_number=source_row.get("item_number"),
                order_index=order_index,
                justification=source_row.get("justification"),
                name=source_row["name"],
                unit=source_row.get("unit"),
                quantity_total=float(Decimal(source_row["quantity"])),
                quantity_done=float(done),
                quantity_prev=float(previous),
                unit_price=float(unit_price),
                total=float(line_total),
            )
        act = await self.repository.get_ks2(act.id)
        snapshot_payload = self._ks2_payload(
            act=act,
            revision=revision,
            status=KS2Status.DRAFT.value,
        )
        snapshot = await self.repository.create_snapshot(
            company_id=company_id,
            project_id=source["project"]["id"],
            estimate_revision_id=revision.id,
            document_type="ks2",
            entity_id=act.id,
            version=1,
            status=KS2Status.DRAFT.value,
            payload_json=snapshot_payload,
            payload_hash=_canonical_hash(snapshot_payload),
            template_version="ks2.v1",
            idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        await self.repository.create_audit_event(
            snapshot_id=snapshot.id,
            company_id=company_id,
            actor_id=actor_id,
            previous_status=None,
            new_status=KS2Status.DRAFT.value,
            reason="Created from approved estimate revision",
        )
        return act

    async def approve_ks2(
        self,
        *,
        ks2_id: int,
        company_id: int,
        actor_id: int | None,
        idempotency_key: str,
    ):
        existing = await self.repository.get_snapshot_by_idempotency_key(
            company_id=company_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            if existing.document_type != "ks2" or existing.entity_id != ks2_id:
                raise DocumentChainIdempotencyConflictError(
                    "Idempotency key belongs to another document command"
                )
            act = await self.repository.get_company_ks2(
                ks2_id=ks2_id,
                company_id=company_id,
            )
            if act is None:
                raise DocumentChainNotFoundError("KS-2 was not found")
            return act

        act = await self.repository.get_company_ks2(
            ks2_id=ks2_id,
            company_id=company_id,
        )
        draft_snapshot = await self.repository.get_document_snapshot(
            document_type="ks2",
            entity_id=ks2_id,
            status=KS2Status.DRAFT.value,
        )
        if act is None or draft_snapshot is None:
            raise DocumentChainNotFoundError(f"KS-2 {ks2_id} was not found")
        if act.status == KS2Status.SIGNED:
            return act
        revision = await self.repository.get_revision(
            revision_id=draft_snapshot.estimate_revision_id,
            company_id=company_id,
        )
        if revision is None:
            raise DocumentChainNotFoundError("Approved source revision was not found")
        source_rows = {
            row["source_id"]: row
            for row in revision.payload_json["rows"]
        }
        prior = await self.repository.get_signed_ks2_quantities(
            revision_id=revision.id,
            company_id=company_id,
            exclude_ks2_id=act.id,
        )
        for item in act.items:
            source_row = source_rows[item.estimate_item_id]
            previous = Decimal(str(prior.get(item.estimate_item_id, 0)))
            done = Decimal(str(item.quantity_done))
            total = Decimal(source_row["quantity"])
            if done <= 0 or done + previous > total:
                raise InvalidDocumentQuantityError(
                    f"Executed quantity exceeds remaining quantity for row {item.estimate_item_id}"
                )
            item.quantity_prev = float(previous)

        act.status = KS2Status.SIGNED
        act.signed_at = datetime.now(timezone.utc)
        await self.session.flush()
        signed_payload = self._ks2_payload(
            act=act,
            revision=revision,
            status=KS2Status.SIGNED.value,
        )
        signed_snapshot = await self.repository.create_snapshot(
            company_id=company_id,
            project_id=revision.payload_json["project"]["id"],
            estimate_revision_id=revision.id,
            document_type="ks2",
            entity_id=act.id,
            version=await self.repository.next_snapshot_version(
                document_type="ks2",
                entity_id=act.id,
            ),
            status=KS2Status.SIGNED.value,
            payload_json=signed_payload,
            payload_hash=_canonical_hash(signed_payload),
            template_version="ks2.v1",
            idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        await self.repository.create_audit_event(
            snapshot_id=signed_snapshot.id,
            company_id=company_id,
            actor_id=actor_id,
            previous_status=KS2Status.DRAFT.value,
            new_status=KS2Status.SIGNED.value,
            reason="KS-2 approved after remaining-quantity validation",
        )
        return act

    async def create_ks3(
        self,
        *,
        ks2_ids: list[int],
        company_id: int,
        actor_id: int | None,
        certificate_data: dict,
        idempotency_key: str,
    ):
        existing = await self.repository.get_snapshot_by_idempotency_key(
            company_id=company_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            if existing.document_type != "ks3":
                raise DocumentChainIdempotencyConflictError(
                    "Idempotency key belongs to another document command"
                )
            certificate = await self.repository.get_ks3(existing.entity_id)
            if certificate is None:
                raise DocumentChainNotFoundError("Idempotent KS-3 record is missing")
            existing_ids = existing.payload_json.get("ks3", {}).get("ks2_ids", [])
            if existing_ids != ks2_ids:
                raise DocumentChainIdempotencyConflictError(
                    "Idempotency key belongs to another KS-3 selection"
                )
            return certificate

        if not ks2_ids or len(set(ks2_ids)) != len(ks2_ids):
            raise InvalidDocumentSelectionError(
                "KS-3 requires a non-empty unique KS-2 selection"
            )
        acts = await self.repository.get_signed_ks2_acts(
            ks2_ids=ks2_ids,
            company_id=company_id,
        )
        acts_by_id = {act.id: act for act in acts}
        if set(acts_by_id) != set(ks2_ids):
            raise InvalidDocumentSelectionError(
                "Every KS-2 must be signed and belong to the active company"
            )
        ordered_acts = [acts_by_id[act_id] for act_id in ks2_ids]
        signed_snapshots = []
        for act in ordered_acts:
            snapshot = await self.repository.get_document_snapshot(
                document_type="ks2",
                entity_id=act.id,
                status=KS2Status.SIGNED.value,
            )
            if snapshot is None or snapshot.company_id != company_id:
                raise InvalidDocumentSelectionError("Signed KS-2 snapshot is missing")
            signed_snapshots.append(snapshot)

        revision_ids = {snapshot.estimate_revision_id for snapshot in signed_snapshots}
        project_ids = {snapshot.project_id for snapshot in signed_snapshots}
        contract_ids = {act.contract_id for act in ordered_acts}
        if len(revision_ids) != 1 or len(project_ids) != 1 or len(contract_ids) != 1:
            raise InvalidDocumentSelectionError(
                "KS-2 acts must share estimate revision, project, and contract"
            )
        used_ids = await self.repository.get_used_ks2_ids(
            ks2_ids=ks2_ids,
            company_id=company_id,
        )
        if used_ids:
            raise InvalidDocumentSelectionError(
                f"KS-2 acts are already included in KS-3: {sorted(used_ids)}"
            )

        revision_id = next(iter(revision_ids))
        project_id = next(iter(project_ids))
        contract_id = next(iter(contract_ids))
        revision = await self.repository.get_revision(
            revision_id=revision_id,
            company_id=company_id,
        )
        if revision is None:
            raise DocumentChainNotFoundError("Estimate revision was not found")
        previous_total = _money(await self.repository.get_previous_ks3_total(
            revision_id=revision_id,
            company_id=company_id,
        ))
        current_total = _money(sum(
            (Decimal(str(act.total_without_vat or 0)) for act in ordered_acts),
            Decimal("0"),
        ))
        vat_amount = _money(sum(
            (Decimal(str(act.vat_amount or 0)) for act in ordered_acts),
            Decimal("0"),
        ))
        total_with_vat = _money(current_total + vat_amount)
        cumulative = _money(previous_total + current_total)
        source = revision.payload_json
        certificate = await self.repository.create_ks3(
            number=certificate_data["number"],
            certificate_date=certificate_data["certificate_date"],
            period_start=certificate_data["period_start"],
            period_end=certificate_data["period_end"],
            contract_id=contract_id,
            customer=source["parties"]["customer"]["name"],
            contractor=source["parties"]["contractor"]["name"],
            object_name=source["object"].get("name"),
            total_contract=float(Decimal(source["totals"]["total_with_vat"])),
            total_from_start=float(cumulative),
            total_from_year_start=float(cumulative),
            total_current_period=float(current_total),
            vat_amount=float(vat_amount),
            total_with_vat=float(total_with_vat),
            status=KS3Status.DRAFT,
        )
        running_total = previous_total
        for order_index, act in enumerate(ordered_acts, 1):
            act_total = _money(act.total_without_vat)
            running_total = _money(running_total + act_total)
            await self.repository.create_ks3_item(
                certificate_id=certificate.id,
                ks2_act_id=act.id,
                item_number=str(order_index),
                order_index=order_index,
                name=f"Акт КС-2 №{act.number} от {act.act_date.isoformat()}",
                total_from_start=float(running_total),
                total_from_year_start=float(running_total),
                total_current_period=float(act_total),
            )
        certificate = await self.repository.get_ks3(certificate.id)
        snapshot_payload = {
            "schema_version": "ks3-snapshot.v1",
            "source": {
                "estimate_revision_id": revision.id,
                "estimate_revision_hash": revision.payload_hash,
                "contract_id": contract_id,
            },
            "ks3": {
                "id": certificate.id,
                "number": certificate.number,
                "certificate_date": certificate.certificate_date.isoformat(),
                "period_start": certificate.period_start.isoformat(),
                "period_end": certificate.period_end.isoformat(),
                "status": KS3Status.DRAFT.value,
                "ks2_ids": ks2_ids,
                "total_contract": _number(certificate.total_contract),
                "total_from_start": _number(certificate.total_from_start),
                "total_from_year_start": _number(certificate.total_from_year_start),
                "total_current_period": _number(certificate.total_current_period),
                "vat_amount": _number(certificate.vat_amount),
                "total_with_vat": _number(certificate.total_with_vat),
            },
        }
        snapshot = await self.repository.create_snapshot(
            company_id=company_id,
            project_id=project_id,
            estimate_revision_id=revision.id,
            document_type="ks3",
            entity_id=certificate.id,
            version=1,
            status=KS3Status.DRAFT.value,
            payload_json=snapshot_payload,
            payload_hash=_canonical_hash(snapshot_payload),
            template_version="ks3.v1",
            idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        await self.repository.create_audit_event(
            snapshot_id=snapshot.id,
            company_id=company_id,
            actor_id=actor_id,
            previous_status=None,
            new_status=KS3Status.DRAFT.value,
            reason="Created from signed KS-2 acts",
        )
        return certificate

    async def create_m29(
        self,
        *,
        estimate_revision_id: int,
        project_id: int,
        company_id: int,
        actor_id: int | None,
        report_data: dict,
        rows: list[dict],
        idempotency_key: str,
    ):
        existing = await self.repository.get_snapshot_by_idempotency_key(
            company_id=company_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            if (
                existing.document_type != "m29"
                or existing.estimate_revision_id != estimate_revision_id
                or existing.project_id != project_id
            ):
                raise DocumentChainIdempotencyConflictError(
                    "Idempotency key belongs to another document command"
                )
            report = await self.repository.get_m29(existing.entity_id)
            if report is None:
                raise DocumentChainNotFoundError("Idempotent M-29 record is missing")
            return report

        revision = await self.repository.get_revision(
            revision_id=estimate_revision_id,
            company_id=company_id,
        )
        if revision is None:
            raise DocumentChainNotFoundError(
                f"Estimate revision {estimate_revision_id} was not found"
            )
        source = revision.payload_json
        if source["project"]["id"] != project_id:
            raise DocumentChainNotFoundError(
                "Project does not belong to the approved estimate revision"
            )
        if (
            source.get("estimate", {}).get("status") != "approved"
            or _canonical_hash(source) != revision.payload_hash
        ):
            raise InvalidSourceRevisionError("M-29 requires an intact approved revision")

        material_rows = [
            row
            for row in source["rows"]
            if row.get("row_type") in {"mat", "material"}
        ]
        actual_by_source = {
            row["source_row_id"]: row
            for row in rows
            if row.get("source_row_id") in {
                material["source_id"] for material in material_rows
            }
        }
        snapshot_rows = []
        total_norm_cost = Decimal("0")
        total_actual_cost = Decimal("0")
        for material in material_rows:
            actual = actual_by_source.get(material["source_id"], {})
            actual_quantity = Decimal(str(actual.get("actual_quantity", 0)))
            actual_cost = _money(actual.get("actual_cost", 0))
            if actual_quantity < 0 or actual_cost < 0:
                raise InvalidDocumentQuantityError(
                    "M-29 actual quantity and cost cannot be negative"
                )
            normative_quantity = Decimal(material["quantity"])
            normative_cost = _money(material["total"])
            total_norm_cost += normative_cost
            total_actual_cost += actual_cost
            snapshot_rows.append({
                "source_row_id": material["source_id"],
                "item_number": material.get("item_number"),
                "name": material["name"],
                "unit": material.get("unit"),
                "normative_quantity": _number(normative_quantity),
                "normative_cost": _number(normative_cost),
                "actual_quantity": _number(actual_quantity),
                "actual_cost": _number(actual_cost),
                "quantity_deviation": _number(actual_quantity - normative_quantity),
                "cost_deviation": _number(actual_cost - normative_cost),
                "deviation_reason": actual.get("deviation_reason"),
            })

        total_norm_cost = _money(total_norm_cost)
        total_actual_cost = _money(total_actual_cost)
        report = await self.repository.create_m29(
            report_number=report_data["report_number"],
            report_date=report_data["report_date"],
            project_id=project_id,
            period_start=report_data.get("period_start"),
            period_end=report_data.get("period_end"),
            responsible_name=report_data.get("responsible_name"),
            total_norm_cost=float(total_norm_cost),
            total_actual_cost=float(total_actual_cost),
            status="draft",
            notes=report_data.get("notes"),
        )
        snapshot_payload = {
            "schema_version": "m29-snapshot.v1",
            "source": {
                "estimate_revision_id": revision.id,
                "estimate_revision_hash": revision.payload_hash,
                "project_id": project_id,
            },
            "m29": {
                "id": report.id,
                "report_number": report.report_number,
                "report_date": report.report_date.isoformat(),
                "period_start": (
                    report.period_start.isoformat() if report.period_start else None
                ),
                "period_end": (
                    report.period_end.isoformat() if report.period_end else None
                ),
                "responsible_name": report.responsible_name,
                "status": report.status,
                "total_norm_cost": _number(total_norm_cost),
                "total_actual_cost": _number(total_actual_cost),
                "cost_deviation": _number(total_actual_cost - total_norm_cost),
                "notes": report.notes,
                "rows": snapshot_rows,
            },
        }
        snapshot = await self.repository.create_snapshot(
            company_id=company_id,
            project_id=project_id,
            estimate_revision_id=revision.id,
            document_type="m29",
            entity_id=report.id,
            version=1,
            status="draft",
            payload_json=snapshot_payload,
            payload_hash=_canonical_hash(snapshot_payload),
            template_version="m29.v1",
            idempotency_key=idempotency_key,
            created_by=actor_id,
        )
        await self.repository.create_audit_event(
            snapshot_id=snapshot.id,
            company_id=company_id,
            actor_id=actor_id,
            previous_status=None,
            new_status="draft",
            reason="Created from material rows of approved estimate revision",
        )
        return report

    @staticmethod
    def _ks2_payload(*, act, revision, status: str) -> dict:
        return {
            "schema_version": "ks2-snapshot.v1",
            "source": {
                "estimate_revision_id": revision.id,
                "estimate_revision_hash": revision.payload_hash,
                "contract_id": act.contract_id,
            },
            "ks2": {
                "id": act.id,
                "number": act.number,
                "act_date": act.act_date.isoformat(),
                "period_start": act.period_start.isoformat(),
                "period_end": act.period_end.isoformat(),
                "status": status,
                "customer": act.customer,
                "contractor": act.contractor,
                "object_name": act.object_name,
                "object_address": act.object_address,
                "total_without_vat": _number(act.total_without_vat),
                "vat_amount": _number(act.vat_amount),
                "total_with_vat": _number(act.total_with_vat),
                "rows": [
                    {
                        "source_row_id": item.estimate_item_id,
                        "item_number": item.item_number,
                        "name": item.name,
                        "unit": item.unit,
                        "quantity_total": _number(item.quantity_total),
                        "quantity_prev": _number(item.quantity_prev),
                        "quantity_done": _number(item.quantity_done),
                        "unit_price": _number(item.unit_price),
                        "total": _number(item.total),
                    }
                    for item in sorted(act.items, key=lambda value: value.order_index)
                ],
            },
        }

    @staticmethod
    def _resolve_contract_type(value, customer: dict) -> ContractType:
        if value is not None:
            return value if isinstance(value, ContractType) else ContractType(value)
        if customer.get("client_type") == "company" or customer.get("inn"):
            return ContractType.LEGAL_ENTITY
        return ContractType.INDIVIDUAL
