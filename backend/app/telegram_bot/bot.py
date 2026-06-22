"""
Telegram Bot service for SmetaAI — уведомления, отчёты, фото по проектам
Требует: pip install python-telegram-bot>=20.0

Для включения: TELEGRAM_BOT_TOKEN=<token> в .env
"""
import logging
from datetime import datetime, time as dt_time
from typing import Optional

from app.config import settings
from app.database import async_session_maker

logger = logging.getLogger(__name__)

try:
    from telegram import Update, Bot
    from telegram.ext import Application, CommandHandler, ContextTypes
    TELEGRAM_AVAILABLE = True
except ImportError:
    TELEGRAM_AVAILABLE = False
    logger.warning("python-telegram-bot не установлен. Telegram бот недоступен.")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

async def get_subscribed_chats() -> list[int]:
    """Return list of enabled chat_ids from the database."""
    from app.models.telegram import TelegramChat
    from sqlalchemy import select

    async with async_session_maker() as session:
        result = await session.execute(
            select(TelegramChat.chat_id).where(TelegramChat.enabled.is_(True))
        )
        return [row[0] for row in result.fetchall()]


async def subscribe_chat(chat_id: int, project_id: Optional[int] = None) -> bool:
    """Subscribe or re-enable a chat. Returns True if created."""
    from app.models.telegram import TelegramChat
    from sqlalchemy import select

    async with async_session_maker() as session:
        result = await session.execute(
            select(TelegramChat).where(TelegramChat.chat_id == chat_id)
        )
        chat = result.scalar_one_or_none()
        if chat:
            chat.enabled = True
            if project_id is not None:
                chat.project_id = project_id
        else:
            chat = TelegramChat(chat_id=chat_id, project_id=project_id, enabled=True)
            session.add(chat)
        await session.commit()
        return True


async def unsubscribe_chat(chat_id: int) -> bool:
    """Disable notifications for a chat."""
    from app.models.telegram import TelegramChat
    from sqlalchemy import select

    async with async_session_maker() as session:
        result = await session.execute(
            select(TelegramChat).where(TelegramChat.chat_id == chat_id)
        )
        chat = result.scalar_one_or_none()
        if chat:
            chat.enabled = False
            await session.commit()
            return True
        return False


# ---------------------------------------------------------------------------
# Bot class
# ---------------------------------------------------------------------------

class TelegramBot:
    """Telegram бот для SmetaAI — команды, отчёты, фото, рассылка."""

    def __init__(self, token: Optional[str] = None):
        self.token = token or getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        self._app: Optional[Application] = None

    # -- lifecycle ----------------------------------------------------------

    async def start(self):
        """Инициализировать и запустить бота (polling / webhook-ready)."""
        if not self.token:
            logger.info("Telegram бот не настроен (токен отсутствует)")
            return
        if not TELEGRAM_AVAILABLE:
            logger.warning("python-telegram-bot не установлен")
            return

        self._app = Application.builder().token(self.token).build()

        # Регистрация обработчиков команд
        self._app.add_handler(CommandHandler("start", self.cmd_start))
        self._app.add_handler(CommandHandler("help", self.cmd_help))
        self._app.add_handler(CommandHandler("stats", self.cmd_stats))
        self._app.add_handler(CommandHandler("report", self.cmd_report))
        self._app.add_handler(CommandHandler("photo", self.cmd_photo))

        # Если нет вебхука — запускаем polling
        # При вебхук-режиме вызывается mount_webhook(), а не start()
        await self._app.initialize()
        await self._app.start()
        logger.info("Telegram бот запущен")

    async def stop(self):
        """Остановить бота."""
        if self._app:
            await self._app.stop()
            await self._app.shutdown()
            self._app = None
            logger.info("Telegram бот остановлен")

    @property
    def application(self) -> Optional[Application]:
        """Доступ к внутреннему Application (для монтирования вебхука)."""
        return self._app

    # -- commands -----------------------------------------------------------

    async def cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Приветственное сообщение с информацией о компании."""
        chat_id = update.effective_chat.id

        # Подписываем чат
        project_id = int(context.args[0]) if context.args and context.args[0].isdigit() else None
        await subscribe_chat(chat_id, project_id=project_id)

        text = (
            f"Добро пожаловать в {settings.COMPANY_NAME}!\n\n"
            f"Я — бот для отслеживания строительных проектов. "
            f"Я помогу вам получать актуальную информацию по объектам, "
            f"фотоотчёты и ежедневную сводку.\n\n"
            f"Доступные команды:\n"
            f"/report <ID> — статус работ по проекту\n"
            f"/photo <ID> — последний фотоотчёт\n"
            f"/stats — статистика на сегодня\n"
            f"/help — список всех команд\n\n"
            f"Ваш Chat ID: <code>{chat_id}</code>"
        )
        await update.message.reply_html(text)

    async def cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Список команд."""
        text = (
            f"<b>{settings.COMPANY_NAME} — Telegram Bot</b>\n\n"
            f"/start — приветствие и подписка на уведомления\n"
            f"/report <b>ID</b> — статус работ по проекту (этапы, сроки, фото)\n"
            f"/photo <b>ID</b> — отправить последний фотоотчёт по проекту\n"
            f"/stats — статистика на сегодня: активные проекты, сделки, задачи\n"
            f"/help — это сообщение\n\n"
            f"<i>Подсказка: ID проекта можно узнать в разделе 'Проекты' CRM.</i>"
        )
        await update.message.reply_html(text)

    async def cmd_stats(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Статистика на сегодня: активные проекты, сделки, выполненные задачи."""
        try:
            stats = await self._fetch_daily_stats()
        except Exception:
            stats = {
                "active_projects": "--",
                "new_deals": "--",
                "tasks_done": "--",
            }

        today = datetime.now().strftime("%d.%m.%Y")
        text = (
            f"<b>Статистика на {today}</b>\n\n"
            f"Активных проектов: <b>{stats['active_projects']}</b>\n"
            f"Новых сделок: <b>{stats['new_deals']}</b>\n"
            f"Выполнено задач: <b>{stats['tasks_done']}</b>\n"
        )
        await update.message.reply_html(text)

    async def cmd_report(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Отправить статус работ по проекту (этапы, сроки, фото)."""
        if not context.args or not context.args[0].isdigit():
            await update.message.reply_html(
                "Укажите ID проекта: <code>/report 42</code>"
            )
            return

        project_id = int(context.args[0])
        try:
            report = await self._fetch_project_report(project_id)
        except Exception as exc:
            logger.error("Ошибка получения отчёта по проекту %s: %s", project_id, exc)
            await update.message.reply_html(
                f"Не удалось получить данные по проекту #{project_id}."
            )
            return

        if "error" in report:
            await update.message.reply_html(report["error"])
            return

        stages_lines = []
        for s in report.get("stages", []):
            status_emoji = {"done": "✅", "in_progress": "🔄", "not_started": "⏳", "delayed": "⚠️"}
            emoji = status_emoji.get(s.get("status", ""), "❓")
            stages_lines.append(
                f"{emoji} <b>{s['name']}</b>\n"
                f"   Срок: {s.get('start_date', '?')} — {s.get('end_date', '?')}"
            )

        stages_text = "\n".join(stages_lines) if stages_lines else "Нет этапов"

        text = (
            f"<b>Отчёт по проекту #{project_id}</b>\n\n"
            f"Название: {report.get('name', '—')}\n"
            f"Статус: {report.get('status', '—')}\n"
            f"Прогресс: {report.get('progress', '—')}%\n"
            f"Бюджет: {report.get('budget', '—')} ₽\n"
            f"Потрачено: {report.get('spent', '—')} ₽\n"
            f"Срок: {report.get('planned_start', '?')} — {report.get('planned_end', '?')}\n\n"
            f"<b>Этапы:</b>\n{stages_text}\n"
        )

        await update.message.reply_html(text)

        # Если есть фото — отправить первое как дополнение
        if report.get("photo_url"):
            try:
                await context.bot.send_photo(
                    chat_id=update.effective_chat.id,
                    photo=report["photo_url"],
                    caption="Последнее фото по проекту",
                )
            except Exception as exc:
                logger.warning("Не удалось отправить фото: %s", exc)

    async def cmd_photo(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Отправить последний фотоотчёт по проекту."""
        if not context.args or not context.args[0].isdigit():
            await update.message.reply_html(
                "Укажите ID проекта: <code>/photo 42</code>"
            )
            return

        project_id = int(context.args[0])
        try:
            photo_url, caption = await self._fetch_latest_photo(project_id)
        except Exception as exc:
            logger.error("Ошибка получения фото проекта %s: %s", project_id, exc)
            await update.message.reply_html(
                f"Не удалось получить фото по проекту #{project_id}."
            )
            return

        if photo_url is None:
            await update.message.reply_html(
                f"Фотоотчётов по проекту #{project_id} пока нет."
            )
            return

        await context.bot.send_photo(
            chat_id=update.effective_chat.id,
            photo=photo_url,
            caption=caption or f"Фотоотчёт — проект #{project_id}",
        )

    # -- public helpers -----------------------------------------------------

    async def send_notification(self, chat_id: int, message: str):
        """Отправить текстовое уведомление в чат."""
        if not self._app:
            logger.info("[TG] Офлайн: %s...", message[:60])
            return
        try:
            await self._app.bot.send_message(chat_id=chat_id, text=message)
        except Exception as exc:
            logger.error("Ошибка отправки сообщения в %s: %s", chat_id, exc)

    async def send_photo_report(self, chat_id: int, project_id: int):
        """Отправить последний фотоотчёт по проекту в указанный чат.

        Удобно вызывать из планировщика или внешнего кода.
        """
        if not self._app:
            logger.info("[TG] Офлайн: фото по проекту %s", project_id)
            return
        photo_url, caption = await self._fetch_latest_photo(project_id)
        if photo_url is None:
            await self.send_notification(
                chat_id,
                f"Фотоотчётов по проекту #{project_id} пока нет.",
            )
            return
        try:
            await self._app.bot.send_photo(
                chat_id=chat_id,
                photo=photo_url,
                caption=caption or f"Проект #{project_id} — фотоотчёт",
            )
        except Exception as exc:
            logger.error("Ошибка отправки фото в %s: %s", chat_id, exc)

    # -- daily digest -------------------------------------------------------

    async def send_daily_summary(self):
        """Ежедневная сводка в 9:00 всем подписанным чатам."""
        chat_ids = await get_subscribed_chats()
        if not chat_ids:
            logger.info("Нет подписанных чатов для ежедневной сводки")
            return

        try:
            stats = await self._fetch_daily_stats()
        except Exception:
            stats = {"active_projects": "--", "new_deals": "--", "tasks_done": "--"}

        today = datetime.now().strftime("%d.%m.%Y")
        text = (
            f"Доброе утро! Ежедневная сводка на {today}\n\n"
            f"Активных проектов: <b>{stats['active_projects']}</b>\n"
            f"Новых сделок: <b>{stats['new_deals']}</b>\n"
            f"Выполнено задач: <b>{stats['tasks_done']}</b>\n\n"
            f"— {settings.COMPANY_NAME}"
        )

        for chat_id in chat_ids:
            try:
                await self._app.bot.send_message(chat_id=chat_id, text=text)
            except Exception as exc:
                logger.warning("Не удалось отправить сводку в %s: %s", chat_id, exc)

    # -- webhook support ----------------------------------------------------

    async def set_webhook(self, url: str):
        """Установить вебхук (вызывается при монтировании в FastAPI)."""
        if not self._app:
            raise RuntimeError("Bot not started")
        await self._app.bot.set_webhook(url=url)

    async def process_update(self, update_data: dict):
        """Обработать входящий update от вебхука."""
        if not self._app:
            raise RuntimeError("Bot not started")
        update = Update.de_json(update_data, self._app.bot)
        await self._app.process_update(update)

    # -- database queries ---------------------------------------------------

    @staticmethod
    async def _fetch_project_report(project_id: int) -> dict:
        """Получить расширенный отчёт по проекту из БД."""
        from app.models.project import Project
        from app.models.work_stage import WorkStage
        from app.models.photo import PhotoReport
        from sqlalchemy import select, func as sa_func

        async with async_session_maker() as session:
            # Проект
            result = await session.execute(
                select(Project).where(Project.id == project_id)
            )
            project = result.scalar_one_or_none()
            if not project:
                return {"error": f"Проект #{project_id} не найден."}

            # Этапы
            stages_result = await session.execute(
                select(WorkStage)
                .where(WorkStage.project_id == project_id)
                .order_by(WorkStage.start_date)
            )
            stages = stages_result.scalars().all()

            # Последнее фото
            photo_result = await session.execute(
                select(PhotoReport)
                .where(PhotoReport.project_id == project_id)
                .order_by(PhotoReport.created_at.desc())
                .limit(1)
            )
            photo = photo_result.scalar_one_or_none()

        status_map = {
            "planning": "Планирование",
            "in_progress": "В работе",
            "on_hold": "Приостановлен",
            "completed": "Завершён",
            "cancelled": "Отменён",
        }

        return {
            "name": project.name,
            "status": status_map.get(project.status.value if hasattr(project.status, 'value') else str(project.status), str(project.status)),
            "progress": round(
                (sum(1 for s in stages if s.status in ("done", "in_progress")) / max(len(stages), 1)) * 100
            ),
            "budget": project.budget or 0,
            "spent": project.spent or 0,
            "planned_start": str(project.planned_start or ""),
            "planned_end": str(project.planned_end or ""),
            "photo_url": str(photo.url) if photo else None,
            "stages": [
                {
                    "name": s.name,
                    "status": s.status,
                    "start_date": str(s.start_date or ""),
                    "end_date": str(s.end_date or ""),
                }
                for s in stages
            ],
        }

    @staticmethod
    async def _fetch_latest_photo(project_id: int) -> tuple[Optional[str], Optional[str]]:
        """Получить URL и подпись последнего фото по проекту."""
        from app.models.photo import PhotoReport
        from sqlalchemy import select

        async with async_session_maker() as session:
            result = await session.execute(
                select(PhotoReport)
                .where(PhotoReport.project_id == project_id)
                .order_by(PhotoReport.created_at.desc())
                .limit(1)
            )
            photo = result.scalar_one_or_none()
            if photo is None:
                return None, None
            return str(photo.url), f"Проект #{project_id} — {photo.created_at.strftime('%d.%m.%Y %H:%M') if photo.created_at else ''}"

    @staticmethod
    async def _fetch_daily_stats() -> dict:
        """Получить статистику на сегодня."""
        from app.models.project import Project, ProjectStatus
        from app.models.deal import Deal
        from app.models.work_stage import WorkStage
        from sqlalchemy import select, func as sa_func

        async with async_session_maker() as session:
            # Активные проекты (в работе)
            active_result = await session.execute(
                select(sa_func.count(Project.id))
                .where(Project.status.in_([ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD]))
            )
            active_projects = active_result.scalar() or 0

            # Новые сделки сегодня — сравниваем по дате (без времени)
            today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            deals_result = await session.execute(
                select(sa_func.count(Deal.id))
                .where(sa_func.date(Deal.created_at) == today_start.date())
            )
            new_deals = deals_result.scalar() or 0

            # Выполненные задачи (этапы со статусом done)
            tasks_result = await session.execute(
                select(sa_func.count(WorkStage.id))
                .where(WorkStage.status == "done")
            )
            tasks_done = tasks_result.scalar() or 0

        return {
            "active_projects": active_projects,
            "new_deals": new_deals,
            "tasks_done": tasks_done,
        }


# ---------------------------------------------------------------------------
# Convenience alias
# ---------------------------------------------------------------------------

class TelegramNotifier(TelegramBot):
    """Alias for backwards compatibility."""
    pass
