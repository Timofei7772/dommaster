"""
Тестирование всех новых API после исправления порядка роутов.
"""
import sys
sys.path.insert(0, '.')

from fastapi.testclient import TestClient
from test_server import app

client = TestClient(app)

def test(endpoint, method="GET", json_data=None):
    try:
        if method == "POST":
            r = client.post(endpoint, json=json_data)
        else:
            r = client.get(endpoint)
        status_ok = r.status_code in (200, 307, 422)
        print(f"{'[OK]' if status_ok else '[FAIL]'} {endpoint:40s} -> {r.status_code} | {r.text[:120]}")
        return status_ok
    except Exception as e:
        print(f"[ERR] {endpoint:40s} -> {e}")
        return False

print("=== Phase 5: Интеграция и тестирование ===\n")

results = []
results.append(("GET /api/v1/projects/clients", test("/api/v1/projects/clients")))
results.append(("POST /api/v1/projects/clients", test("/api/v1/projects/clients", "POST", {
    "name": "Тестовый клиент", "phone": "+79991234567", "email": "test@example.com"
})))
results.append(("GET /api/v1/projects", test("/api/v1/projects")))
results.append(("GET /api/v1/tasks", test("/api/v1/tasks")))
results.append(("GET /api/v1/resources", test("/api/v1/resources")))
results.append(("GET /api/v1/schedule", test("/api/v1/schedule")))
results.append(("GET /api/v1/invoices", test("/api/v1/invoices")))

ok_count = sum(1 for _, ok in results if ok)
print(f"\n=== Итоги: {ok_count}/{len(results)} успешно ===")
for name, ok in results:
    print(f"  {'[OK]' if ok else '[FAIL]'} {name}")
