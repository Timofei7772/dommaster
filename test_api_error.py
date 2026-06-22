"""
Тестирование API с выводом подробной ошибки.
"""
import sys
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from test_server import app

client = TestClient(app)

print("=== Тест: GET /api/v1/projects/clients ===")
try:
    r = client.get("/api/v1/projects/clients")
    print(f"Status: {r.status_code}")
    print(f"Body: {r.text}")
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()

print("\n=== Тест: GET /api/v1/tasks ===")
try:
    r = client.get("/api/v1/tasks")
    print(f"Status: {r.status_code}")
    print(f"Body: {r.text[:200]}")
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()

print("\n=== Тест: GET /api/v1/resources ===")
try:
    r = client.get("/api/v1/resources")
    print(f"Status: {r.status_code}")
    print(f"Body: {r.text[:200]}")
except Exception as e:
    print(f"Exception: {e}")
    import traceback
    traceback.print_exc()
