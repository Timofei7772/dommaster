"""Business invariants for digital supervision of construction stages."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.photo import PhotoReport
from app.models.work_stage import WorkStage
from app.shared.enums import WorkStageStatus


class StageWorkflowError(Exception):
    """Base class for rejected stage workflow commands."""

    code = "STAGE_WORKFLOW_ERROR"


class StageReviewRequiredError(StageWorkflowError):
    code = "STAGE_REVIEW_REQUIRED"


class PhotoProofRequiredError(StageWorkflowError):
    code = "PHOTO_PROOF_REQUIRED"


class LastStageProofError(StageWorkflowError):
    code = "LAST_STAGE_PROOF"


class InitialStageStatusError(StageWorkflowError):
    code = "STAGE_PROOF_REQUIRED"


class StageWorkflowService:
    """Keep acceptance rules out of HTTP handlers and persistence models."""

    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def validate_initial_status(status: WorkStageStatus) -> None:
        if status in {WorkStageStatus.REVIEW, WorkStageStatus.COMPLETED}:
            raise InitialStageStatusError(
                "Новый этап нельзя создать принятым или завершенным"
            )

    async def _photo_count(self, stage_id: int) -> int:
        return int(await self.session.scalar(
            select(func.count(PhotoReport.id)).where(PhotoReport.stage_id == stage_id)
        ) or 0)

    async def validate_transition(
        self,
        *,
        stage: WorkStage,
        target: WorkStageStatus,
    ) -> None:
        if target.value == stage.status:
            return

        if target is WorkStageStatus.REVIEW:
            if await self._photo_count(stage.id) == 0:
                raise PhotoProofRequiredError(
                    "Для передачи этапа на приемку нужна фотофиксация"
                )
            return

        if target is WorkStageStatus.COMPLETED:
            if stage.status != WorkStageStatus.REVIEW.value:
                raise StageReviewRequiredError(
                    "Сначала этап должен пройти статус приемки"
                )
            if await self._photo_count(stage.id) == 0:
                raise PhotoProofRequiredError(
                    "Нельзя завершить этап без фотофиксации"
                )

    def mark_ready_for_review(self, stage: WorkStage) -> None:
        if stage.status != WorkStageStatus.COMPLETED.value:
            stage.status = WorkStageStatus.REVIEW.value

    async def ensure_photo_can_be_deleted(self, photo: PhotoReport) -> None:
        if (
            photo.stage is not None
            and photo.stage.status == WorkStageStatus.COMPLETED.value
            and await self._photo_count(photo.stage.id) <= 1
        ):
            raise LastStageProofError(
                "Нельзя удалить последнее доказательство принятого этапа"
            )
