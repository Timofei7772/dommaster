import asyncio
from pathlib import Path


def test_generate_estimate_export_returns_xlsx_path(tmp_path):
    from app.services.document_generator import DocumentGeneratorService

    service = DocumentGeneratorService(db=None)
    service.output_dir = str(tmp_path)

    class DummyEstimate:
        id = 1
        number = "ЛС-0001"
        project_id = None
        name = "Тестовая смета"
        vat_percent = 20.0
        vat_on_top = True
        items = []
        sections = []

    path = asyncio.run(service._generate_estimate_export(DummyEstimate(), {}))

    assert path.endswith(".xlsx")
    assert Path(path).exists()
