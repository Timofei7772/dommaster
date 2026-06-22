"""
Минимальный тестовый сервер с расширенным health-check и мониторингом.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SmetaAI CRM Test", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем только новые роутеры
from api.tasks import router as tasks_router
from api.resource import router as resources_router
from api.schedule import router as schedule_router
from api.invoice import router as invoices_router
from api.projects import router as projects_router

app.include_router(tasks_router, prefix="/api/v1/tasks", tags=["tasks"])
app.include_router(resources_router, prefix="/api/v1/resources", tags=["resources"])
app.include_router(schedule_router, prefix="/api/v1/schedule", tags=["schedule"])
app.include_router(invoices_router, prefix="/api/v1/invoices", tags=["invoices"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])

# Try to import psutil for system monitoring
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False


@app.get("/health")
async def health():
    info = {"status": "ok", "mode": "test", "version": "2.0.0"}

    if PSUTIL_AVAILABLE:
        info["cpu_percent"] = psutil.cpu_percent(interval=0.1)
        info["memory"] = {
            "total_mb": round(psutil.virtual_memory().total / (1024**2), 1),
            "used_mb": round(psutil.virtual_memory().used / (1024**2), 1),
            "percent": psutil.virtual_memory().percent,
        }
        disk = psutil.disk_usage('.')
        info["disk"] = {
            "total_gb": round(disk.total / (1024**3), 2),
            "used_gb": round(disk.used / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
        }

    # Check DB file
    import os
    db_path = "smeta.db"
    if os.path.exists(db_path):
        info["database"] = {
            "exists": True,
            "size_mb": round(os.path.getsize(db_path) / (1024**2), 2),
        }
    else:
        info["database"] = {"exists": False}

    return info


@app.get("/metrics")
async def metrics():
    """Simple metrics endpoint."""
    return {
        "endpoints_tested": ["tasks", "resources", "schedule", "invoices", "projects"],
        "status": "operational",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
