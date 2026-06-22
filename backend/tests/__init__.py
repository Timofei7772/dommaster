from pathlib import Path
import sys


TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
REPO_DIR = BACKEND_DIR.parent

for path in (str(BACKEND_DIR), str(REPO_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)
