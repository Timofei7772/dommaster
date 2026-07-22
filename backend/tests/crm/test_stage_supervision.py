"""Digital-supervision invariants for project stages."""

from datetime import date

import httpx
import pytest
from fastapi import FastAPI

from app.database import get_db
from app.models.photo import PhotoReport
from app.models.project import Project
from app.models.work_stage import WorkStage
from app.routers.auth import get_current_user


def _stage_app(db_session, current_user):
    from app.routers import crm_photos, crm_stages

    app = FastAPI()
    app.include_router(crm_stages.router, prefix="/api/crm-stages")
    app.include_router(crm_photos.router, prefix="/api/crm-photos")

    async def override_db():
        yield db_session

    async def override_current_user():
        return current_user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_current_user
    return app


async def _request(app, method, path, **kwargs):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.asyncio
async def test_stage_requires_review_and_photo_before_completion(
    db_session,
    company,
    manager,
    tmp_path,
    monkeypatch,
):
    from app.routers import crm_photos

    monkeypatch.setattr(crm_photos, "UPLOAD_DIR", str(tmp_path))
    project = Project(
        name="Объект технадзора",
        company_id=company.id,
        created_by=manager.id,
    )
    db_session.add(project)
    await db_session.flush()
    stage = WorkStage(
        project_id=project.id,
        name="Скрытая разводка",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 2),
        status="in_progress",
    )
    db_session.add(stage)
    await db_session.flush()

    app = _stage_app(db_session, manager)
    rejected = await _request(
        app,
        "PUT",
        f"/api/crm-stages/{stage.id}",
        json={"status": "done"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "STAGE_REVIEW_REQUIRED"

    uploaded = await _request(
        app,
        "POST",
        f"/api/crm-photos/project/{project.id}/upload",
        data={"stage_id": str(stage.id)},
        files={"files": ("proof.jpg", b"\xff\xd8\xff\xe0proof", "image/jpeg")},
    )
    assert uploaded.status_code == 201, uploaded.text
    await db_session.refresh(stage)
    assert stage.status == "review"

    completed = await _request(
        app,
        "PUT",
        f"/api/crm-stages/{stage.id}",
        json={"status": "done"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "done"


@pytest.mark.asyncio
async def test_stage_cannot_be_created_as_already_completed(
    db_session,
    company,
    manager,
):
    project = Project(
        name="Новый объект",
        company_id=company.id,
        created_by=manager.id,
    )
    db_session.add(project)
    await db_session.flush()

    response = await _request(
        _stage_app(db_session, manager),
        "POST",
        f"/api/crm-stages/project/{project.id}",
        json={
            "name": "Попытка обхода приемки",
            "start_date": "2026-07-01",
            "end_date": "2026-07-02",
            "status": "done",
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "STAGE_PROOF_REQUIRED"


@pytest.mark.asyncio
async def test_completed_stage_keeps_at_least_one_photo_proof(
    db_session,
    company,
    manager,
):
    project = Project(
        name="Объект с принятым этапом",
        company_id=company.id,
        created_by=manager.id,
    )
    db_session.add(project)
    await db_session.flush()
    stage = WorkStage(
        project_id=project.id,
        name="Гидроизоляция",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 2),
        status="done",
    )
    db_session.add(stage)
    await db_session.flush()
    photo = PhotoReport(
        project_id=project.id,
        stage_id=stage.id,
        url="/uploads/proof.jpg",
        uploaded_by=manager.id,
    )
    db_session.add(photo)
    await db_session.flush()

    app = _stage_app(db_session, manager)
    response = await _request(
        app,
        "DELETE",
        f"/api/crm-photos/{photo.id}",
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "LAST_STAGE_PROOF"


def test_client_is_not_an_employee_role():
    from app.models.user import UserRole

    assert "client" not in {role.value for role in UserRole}
