"""
Миграция: добавление полей для совместимости со Смета 2007.
Запуск: python migrations/add_smeta2007_fields.py
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "smeta_ai.db"


def migrate():
    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()

    # Получаем существующие колонки
    c.execute("PRAGMA table_info(estimates)")
    est_cols = {row[1] for row in c.fetchall()}

    c.execute("PRAGMA table_info(estimate_items)")
    item_cols = {row[1] for row in c.fetchall()}

    # --- estimates ---
    new_est_cols = {
        "work_coef":         "REAL DEFAULT 1.8",
        "material_coef":     "REAL DEFAULT 1.04",
        "vat_on_top":        "INTEGER DEFAULT 1",
        "source_defect_id":  "INTEGER REFERENCES estimates(id)",
    }
    for col, definition in new_est_cols.items():
        if col not in est_cols:
            c.execute(f"ALTER TABLE estimates ADD COLUMN {col} {definition}")
            print(f"  + estimates.{col}")

    # Добавляем тип дефектовки если его нет в enum
    # SQLite не поддерживает enum — просто убедимся что 'defectovka' валиден
    # (поле estimate_type — TEXT, ограничений нет)

    # --- estimate_items ---
    new_item_cols = {
        "row_type":      "TEXT DEFAULT 'pr'",
        "quantity_expr": "TEXT",
    }
    for col, definition in new_item_cols.items():
        if col not in item_cols:
            c.execute(f"ALTER TABLE estimate_items ADD COLUMN {col} {definition}")
            print(f"  + estimate_items.{col}")

    conn.commit()
    conn.close()
    print("Миграция завершена.")


if __name__ == "__main__":
    migrate()
