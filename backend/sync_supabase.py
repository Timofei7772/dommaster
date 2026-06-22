"""
DomMaster OS -> Supabase sync
Синхронизирует локальные данные (SQLite) с Supabase через REST API.
Запуск: python sync_supabase.py

Требует SUPABASE_URL и SUPABASE_SERVICE_KEY в .env
"""
import asyncio, json, os, sys
from urllib.parse import urljoin

import httpx

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

# Load .env from project root
env_path = os.path.join(BACKEND_DIR, '..', '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required in .env")
    sys.exit(1)


async def fetch_local(table: str) -> list[dict]:
    from app.database import async_session_maker
    from sqlalchemy import text
    async with async_session_maker() as db:
        result = await db.execute(text(f"SELECT * FROM {table}"))
        cols = result.keys()
        return [dict(zip(cols, row)) for row in result.fetchall()]


async def push_to_supabase(table: str, rows: list[dict]):
    if not rows:
        print(f"  {table}: no data")
        return

    url = urljoin(SUPABASE_URL.rstrip("/") + "/", f"rest/v1/{table}")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    for i in range(0, len(rows), 50):
        batch = rows[i:i + 50]
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, headers=headers, json=batch)
        if resp.status_code not in (200, 201, 204):
            print(f"  {table}: error [{resp.status_code}] {resp.text[:200]}")
        else:
            print(f"  {table}: {len(batch)} records OK")


async def main():
    print("== DomMaster > Supabase Sync ==\n")

    TABLES = ["local_prices", "competitor_estimates", "telegram_chats", "handwriting_results", "projects"]

    for table in TABLES:
        print(f"[{table}]")
        try:
            rows = await fetch_local(table)
            await push_to_supabase(table, rows)
        except Exception as e:
            print(f"  {table}: error - {e}")

    print("\nDone")


if __name__ == "__main__":
    asyncio.run(main())
