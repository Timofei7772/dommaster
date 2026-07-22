"""
Модели данных Смета AI
"""

from app.models.estimate import (
    Estimate,
    EstimateItem,
    EstimateSection,
    EstimateType
)
from app.models.work import Work, WorkCategory, WorkResource
from app.models.material import Material, MaterialCategory, MaterialPriceHistory
from app.models.ks2 import KS2Act, KS2Item
from app.models.ks3 import KS3Certificate, KS3Item
from app.models.contract import Contract, ContractType
from app.models.project import Project, ProjectObject
from app.models.user import User, UserRole
from app.models.license import License, LicenseActivation, LicenseAuditLog
from app.models.template import MessageTemplate
from app.models.company import Company
from app.models.work_stage import WorkStage
from app.models.payment import Payment
from app.models.photo import PhotoReport
from app.models.request import CRMRequest

# ERP-модели
from app.models.client import Client
from app.models.erp_models import (
    WorkMaterial,
    MaterialUsage,
    LaborPayment,
    WorkProgress,
    ProjectFinance,
)
from app.models.document_registry import Document, DocumentType, DocumentStatus
from app.models.document_workflow import (
    DocumentAuditEvent,
    DocumentSnapshot,
    EstimateRevision,
)
from app.models.versioning import EstimateVersion, AuditLog

# CRM
from app.models.deal import Deal, DealActivity, DealStage
from app.models.local_price import LocalPrice

# Telegram
from app.models.telegram import TelegramChat

# M29
from app.models.m29_report import M29Report

__all__ = [
    "Estimate",
    "EstimateItem",
    "EstimateSection",
    "EstimateType",
    "Work",
    "WorkCategory",
    "WorkResource",
    "Material",
    "MaterialCategory",
    "MaterialPriceHistory",
    "KS2Act",
    "KS2Item",
    "KS3Certificate",
    "KS3Item",
    "Contract",
    "ContractType",
    "Project",
    "ProjectObject",
    "User",
    "UserRole",
    "License",
    "LicenseActivation",
    "LicenseAuditLog",
    # CRM
    "Company",
    "WorkStage",
    "Payment",
    "PhotoReport",
    "CRMRequest",
    # ERP
    "Client",
    "WorkMaterial",
    "MaterialUsage",
    "LaborPayment",
    "WorkProgress",
    "ProjectFinance",
    "Document",
    "DocumentType",
    "DocumentStatus",
    "EstimateRevision",
    "DocumentSnapshot",
    "DocumentAuditEvent",
    "EstimateVersion",
    "AuditLog",
    # CRM (Deals)
    "Deal",
    "DealActivity",
    "DealStage",
    # DomMaster OS
    "LocalPrice",
    # Telegram
    "TelegramChat",
    # M29
    "M29Report",
]
