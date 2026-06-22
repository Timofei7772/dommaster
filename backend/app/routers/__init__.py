"""
Роутеры API
"""

from app.routers.estimates import router as estimates_router
from app.routers.works import router as works_router
from app.routers.materials import router as materials_router
from app.routers.ks2 import router as ks2_router
from app.routers.ks3 import router as ks3_router
from app.routers.contracts import router as contracts_router
from app.routers.ai_assistant import router as ai_router
from app.routers.license import router as license_router
from app.routers.competitor_analysis import router as competitor_router

__all__ = [
    "estimates_router",
    "works_router",
    "materials_router",
    "ks2_router",
    "ks3_router",
    "contracts_router",
    "ai_router",
    "license_router",
    "competitor_router",
]
