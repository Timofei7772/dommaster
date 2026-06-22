"""
Тестирование новых API: tasks, resources, schedule, invoices.
Используем FastAPI TestClient, не требует запуска сервера.
"""
import sys
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_client_api():
    print("=== Тест: GET /api/v1/projects/clients ===")
    r = client.get("/api/v1/projects/clients")
    print(f"Status: {r.status_code}, Body: {r.text[:200]}")
    return r.status_code == 200

def test_task_api():
    print("\n=== Тест: POST /api/v1/tasks ===")
    r = client.post("/api/v1/tasks", json={
        "project_id": "12345678-1234-5678-1234-567812345678",
        "name": "Тестовая задача",
    })
    print(f"Status: {r.status_code}, Body: {r.text[:200]}")
    return r.status_code in (200, 400, 422)

def test_resource_api():
    print("\n=== Тест: GET /api/v1/resources ===")
    r = client.get("/api/v1/resources")
    print(f"Status: {r.status_code}, Body: {r.text[:200]}")
    return r.status_code == 200

def test_schedule_api():
    print("\n=== Тест: GET /api/v1/schedule ===")
    r = client.get("/api/v1/schedule")
    print(f"Status: {r.status_code}, Body: {r.text[:200]}")
    return r.status_code == 200

def test_invoice_api():
    print("\n=== Тест: GET /api/v1/invoices ===")
    r = client.get("/api/v1/invoices")
    print(f"Status: {r.status_code}, Body: {r.text[:200]}")
    return r.status_code == 200

if __name__ == "__main__":
    results = []
    results.append(("Clients API", test_client_api()))
    results.append(("Tasks API", test_task_api()))
    results.append(("Resources API", test_resource_api()))
    results.append(("Schedule API", test_schedule_api()))
    results.append(("Invoices API", test_invoice_api()))

    print("\n=== Итоги ===")
    for name, ok in results:
        print(f"{'✓' if ok else '✗'} {name}")
