import sqlite3
import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smeta_ai.db")

def migrate():
    if not os.path.exists(DB_PATH):
        logging.error(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Table: DEALS
        cursor.execute("PRAGMA table_info(deals)")
        deal_cols = {c[1] for c in cursor.fetchall()}
        
        deals_schema = {
            "sale_amount": "FLOAT DEFAULT 0.0",
            "cost_amount": "FLOAT DEFAULT 0.0",
            "profit": "FLOAT DEFAULT 0.0",
            "estimate_total": "FLOAT DEFAULT 0.0",
            "estimate_id": "INTEGER",
            "advance_amount": "FLOAT DEFAULT 0.0",
            "stage": "VARCHAR(50) DEFAULT 'lead'",
            "is_lost": "BOOLEAN DEFAULT 0",
            "source": "VARCHAR(100)",
            "contact_name": "VARCHAR(300)",
            "contact_phone": "VARCHAR(50)",
            "meeting_date": "DATETIME",
            "meeting_notes": "TEXT",
            "master_id": "INTEGER",
            "master_name": "VARCHAR(300)",
            "lost_reason": "VARCHAR(500)",
            "closed_at": "DATETIME",
            "next_action": "VARCHAR(500)",
            "next_action_date": "DATETIME",
            "last_contact_at": "DATETIME"
        }

        for col, col_type in deals_schema.items():
            if col not in deal_cols:
                logging.info(f"Adding column '{col}' to 'deals'")
                cursor.execute(f"ALTER TABLE deals ADD COLUMN {col} {col_type}")

        # Data migration for Deals (from old columns to new columns if they exist)
        if "amount" in deal_cols and "sale_amount" not in deal_cols:
            logging.info("Migrating 'amount' -> 'sale_amount'")
            cursor.execute("UPDATE deals SET sale_amount = amount WHERE amount IS NOT NULL")
        
        if "master_cost" in deal_cols and "cost_amount" not in deal_cols:
            logging.info("Migrating 'master_cost' -> 'cost_amount'")
            cursor.execute("UPDATE deals SET cost_amount = master_cost WHERE master_cost IS NOT NULL")

        if "margin" in deal_cols and "profit" not in deal_cols:
            logging.info("Migrating 'margin' -> 'profit'")
            cursor.execute("UPDATE deals SET profit = margin WHERE margin IS NOT NULL")

        # Table: ESTIMATES
        cursor.execute("PRAGMA table_info(estimates)")
        est_cols = {c[1] for c in cursor.fetchall()}

        estimates_schema = {
            "deal_id": "INTEGER"
        }

        for col, col_type in estimates_schema.items():
            if col not in est_cols:
                logging.info(f"Adding column '{col}' to 'estimates'")
                cursor.execute(f"ALTER TABLE estimates ADD COLUMN {col} {col_type}")

        # Table: MESSAGE_TEMPLATES
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS message_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stage VARCHAR(50) DEFAULT 'common',
                title VARCHAR(300) NOT NULL,
                content TEXT NOT NULL,
                template_type VARCHAR(50) DEFAULT 'TEMPLATE',
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Insert some seed templates if table is empty
        cursor.execute("SELECT COUNT(*) FROM message_templates")
        if cursor.fetchone()[0] == 0:
            logging.info("Seeding default templates...")
            seed_data = [
                ("lead", "Первое касание (до звонка)", "Здравствуйте, {name}! Вы интересовались ремонтом. Меня зовут [...], готов(а) ответить на вопросы.", "TEMPLATE"),
                ("contact", "Договориться на замер", "Уважаемый {name}. Ориентировочная стоимость работ по вашей задаче ясна. Предлагаю назначить точный замер на объекте: {address}. Это бесплатно.", "TEMPLATE"),
                ("meeting", "Отправка сметы", "{name}, подготовили предварительную смету. Сумма: {sale_amount} руб. В файле подробности.", "TEMPLATE"),
                ("advance", "Запрос аванса", "{name}, для старта работ по адресу {address} необходимо внести аванс. Сумма по договору: {sale_amount} руб.", "TEMPLATE"),
                ("common", "Дожим: возражение 'Дорого'", "Смета открыта. Мы закладываем качественные материалы и работу проверенных мастеров. Дешевле — часто значит переделки.", "SCRIPT")
            ]
            cursor.executemany(
                "INSERT INTO message_templates (stage, title, content, template_type) VALUES (?, ?, ?, ?)",
                seed_data
            )

        conn.commit()
        logging.info("Migration completed successfully.")

    except Exception as e:
        conn.rollback()
        logging.error(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
