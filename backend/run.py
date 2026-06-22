"""
DomMaster OS — Backend server entry point
- Ставит DATABASE_URL в окружение ДО импорта app
- Создаёт .db рядом с .exe
- Передаёт seed в lifespan приложения
"""
import sys, os, socket, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler(sys.stdout)])
logger = logging.getLogger("dommaster")

def get_db_path():
    base = os.path.dirname(sys.argv[0] or '.')
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    return os.path.abspath(os.path.join(base, "dommaster.db"))

DB_PATH = get_db_path()
os.environ['DATABASE_URL'] = f"sqlite+aiosqlite:///{DB_PATH}"

def find_free_port(start=8000, end=9000):
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('localhost', port)) != 0:
                return port
    return 8000

def load_env():
    """Загрузить .env из корня проекта (run.py живёт в backend/, .env в parent)."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())

def main():
    load_env()
    if getattr(sys, 'frozen', False):
        sys.path.insert(0, sys._MEIPASS)
        os.chdir(os.path.dirname(sys.executable))
    else:
        os.chdir(os.path.dirname(os.path.abspath(__file__)))

    port = find_free_port(8000)
    print(f"DOMSERVER_PORT={port}", flush=True)
    logger.info(f"Starting on http://127.0.0.1:{port}  DB: {DB_PATH}")

    import uvicorn
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info", access_log=False)

if __name__ == "__main__":
    main()
