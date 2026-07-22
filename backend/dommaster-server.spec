# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec: DomMaster OS Backend → dommaster-server.exe
Запуск из папки backend/: pyinstaller --clean --noconfirm dommaster-server.spec
"""

import os

# SPECPATH должен быть установлен PyInstaller в папку со spec-файлом.
# Но если нет — используем cwd.
_base = SPECPATH if 'SPECPATH' in dir() else os.getcwd()

a = Analysis(
    [os.path.join(_base, 'run.py')],
    pathex=[_base],
    binaries=[],
    datas=[
        (os.path.join(_base, 'settings.json'), '.'),
    ],
    hiddenimports=[
        # core
        'app', 'app.main', 'app.config', 'app.database', 'app.seed',
        'app.schema_migrations',
        'app.ai', 'app.ai.key_manager', 'app.ai.llm_provider', 'app.ai.orchestrator',
        'app.ai.base_agent',
        # ai agents
        'app.ai.agents',
        'app.ai.agents.object_analyzer', 'app.ai.agents.design_analyzer',
        'app.ai.agents.work_generator', 'app.ai.agents.volume_estimator',
        'app.ai.agents.material_estimator', 'app.ai.agents.finance_agent',
        'app.ai.agents.estimate_validator_agent', 'app.ai.agents.document_agent',
        'app.ai.agents.site_manager', 'app.ai.agents.profit_optimizer',
        'app.ai.agents.lead_analyzer', 'app.ai.agents.learning_agent',
        'app.ai.agents.price_localizer_agent', 'app.ai.agents.estimate_comparator_agent',
        'app.ai.agents.handwriting_ocr_agent',
        # models
        'app.models',
        'app.models.estimate', 'app.models.work', 'app.models.material',
        'app.models.ks2', 'app.models.ks3', 'app.models.contract',
        'app.models.project', 'app.models.user', 'app.models.license',
        'app.models.template', 'app.models.company', 'app.models.work_stage',
        'app.models.payment', 'app.models.photo', 'app.models.request',
        'app.models.client', 'app.models.erp_models',
        'app.models.document_registry', 'app.models.versioning',
        'app.models.deal', 'app.models.local_price', 'app.models.telegram',
        'app.models.m29_report', 'app.models.document_workflow',
        # repositories
        'app.repositories.document_workflow_repository',
        # routers (all of them — PyInstaller can't auto-detect dynamic imports)
        'app.routers',
        'app.routers.estimates', 'app.routers.estimate_items', 'app.routers.works',
        'app.routers.materials', 'app.routers.settings', 'app.routers.ks2',
        'app.routers.ks3', 'app.routers.contracts', 'app.routers.auth',
        'app.routers.deals', 'app.routers.photo_scanner', 'app.routers.telegram_webhook',
        'app.routers.license', 'app.routers.payment', 'app.routers.clients',
        'app.routers.documents', 'app.routers.templates', 'app.routers.progress',
        'app.routers.finance', 'app.routers.ai_assistant', 'app.routers.ai_orchestrator',
        'app.routers.ai_design', 'app.routers.ai_estimate_gen',
        'app.routers.ai_site_manager', 'app.routers.ai_profit',
        'app.routers.leads', 'app.routers.analytics', 'app.routers.crm_projects',
        'app.routers.crm_stages', 'app.routers.crm_payments', 'app.routers.crm_photos',
        'app.routers.crm_requests', 'app.routers.crm_estimates', 'app.routers.client_portal',
        'app.routers.competitor_analysis', 'app.routers.handwriting_ocr',
        'app.routers.director_dashboard', 'app.routers.local_prices', 'app.routers.m29',
        'app.routers.document_chain',
        # services
        'app.services',
        'app.services.document_generator', 'app.services.estimate_service',
        'app.services.license_service', 'app.services.license_generator',
        'app.services.estimate_template_builder', 'app.services.estimate_validator',
        'app.services.finance_service', 'app.services.material_calculator',
        'app.services.work_progress_service', 'app.services.profit_optimization',
        'app.services.audit_service', 'app.services.autosave_service',
        'app.services.snapshot_service', 'app.services.document_chain_service',
        # sqlalchemy
        'sqlalchemy.dialects.sqlite', 'sqlalchemy.dialects.sqlite.aiosqlite',
        'aiosqlite',
        # auth
        'passlib.handlers.bcrypt', 'jose', 'jose.jwt', 'jose.jws',
        # documents
        'openpyxl', 'openpyxl.styles', 'openpyxl.utils',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'unittest', 'test', 'tests',
        'matplotlib', 'numpy', 'scipy', 'pandas',
        'jupyter', 'IPython', 'notebook',
        'pytest', 'coverage', 'mypy',
        'pip', 'setuptools', 'wheel',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='dommaster-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
