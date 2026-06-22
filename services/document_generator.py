"""
Генерация документов: КП, договор, КС-2, КС-3, М-29, счёт.
"""
import os
import uuid
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Estimate, EstimateSection, EstimateItem, ProjectFinance,
    Document, DocumentType, Project, Client, MaterialUsage,
    WorkProgress,
)
from config import config

logger = logging.getLogger(__name__)


class DocumentGeneratorService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.output_dir = config.documents.output_dir
        self.template_dir = config.documents.template_dir
        os.makedirs(self.output_dir, exist_ok=True)

    # ------------------------------------------------------------------ #
    #  Загрузка данных                                                    #
    # ------------------------------------------------------------------ #
    async def _load_estimate_full(self, estimate_id: uuid.UUID) -> dict:
        est_result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = est_result.scalar_one()

        proj_result = await self.db.execute(
            select(Project).where(Project.id == estimate.project_id)
        )
        project = proj_result.scalar_one()

        client = None
        if project.client_id:
            cl_result = await self.db.execute(
                select(Client).where(Client.id == project.client_id)
            )
            client = cl_result.scalar_one_or_none()

        sect_result = await self.db.execute(
            select(EstimateSection)
            .where(EstimateSection.estimate_id == estimate_id)
            .order_by(EstimateSection.order_index)
        )
        sections = list(sect_result.scalars().all())

        sections_data = []
        for sec in sections:
            items_result = await self.db.execute(
                select(EstimateItem).where(EstimateItem.section_id == sec.id)
            )
            items = list(items_result.scalars().all())
            sections_data.append({
                "name": sec.name,
                "total_works": sec.total_works,
                "total_materials": sec.total_materials,
                "total_cost": sec.total_cost,
                "items": [
                    {
                        "name": i.name,
                        "unit": i.unit,
                        "quantity": i.quantity,
                        "price_work": i.price_work,
                        "price_material": i.price_material,
                        "total_work": i.total_work,
                        "total_material": i.total_material,
                        "total_cost": i.total_cost,
                        "completed_volume": i.completed_volume,
                        "remaining_volume": i.remaining_volume,
                    }
                    for i in items
                ],
            })

        fin_result = await self.db.execute(
            select(ProjectFinance).where(ProjectFinance.estimate_id == estimate_id)
        )
        finance = fin_result.scalar_one_or_none()

        return {
            "estimate": estimate,
            "project": project,
            "client": client,
            "sections": sections_data,
            "finance": finance,
        }

    # ------------------------------------------------------------------ #
    #  Сохранение ссылки на документ                                      #
    # ------------------------------------------------------------------ #
    async def _save_document_record(
        self,
        estimate_id: uuid.UUID,
        doc_type: DocumentType,
        file_path: str,
        file_name: str,
    ) -> Document:
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        doc = Document(
            estimate_id=estimate_id,
            document_type=doc_type,
            file_path=file_path,
            file_name=file_name,
            file_size=file_size,
        )
        self.db.add(doc)
        await self.db.flush()
        return doc

    # ------------------------------------------------------------------ #
    #  КП — Коммерческое предложение                                      #
    # ------------------------------------------------------------------ #
    async def generate_kp(self, estimate_id: uuid.UUID) -> Document:
        data = await self._load_estimate_full(estimate_id)
        estimate = data["estimate"]
        project = data["project"]
        client = data["client"]
        finance = data["finance"]

        lines = []
        lines.append("=" * 70)
        lines.append("КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ")
        lines.append(f"№ {estimate.estimate_number}")
        lines.append(f"от {datetime.now().strftime('%d.%m.%Y')}")
        lines.append("=" * 70)
        lines.append("")

        if client:
            lines.append(f"Заказчик: {client.name}")
            if client.company:
                lines.append(f"Компания: {client.company}")
            lines.append("")

        lines.append(f"Объект: {project.name}")
        if project.address:
            lines.append(f"Адрес: {project.address}")
        if project.area:
            lines.append(f"Площадь: {project.area} м²")
        lines.append("")
        lines.append("-" * 70)

        row_num = 0
        for section in data["sections"]:
            lines.append(f"\n  {section['name']}")
            lines.append(
                f"  {'№':<4} {'Наименование':<30} {'Ед.':<6} "
                f"{'Кол.':<8} {'Работа':<10} {'Мат.':<10} {'Итого':<12}"
            )
            lines.append("  " + "-" * 80)
            for item in section["items"]:
                row_num += 1
                lines.append(
                    f"  {row_num:<4} {item['name'][:30]:<30} {item['unit']:<6} "
                    f"{item['quantity']:<8.1f} {item['total_work']:<10.2f} "
                    f"{item['total_material']:<10.2f} {item['total_cost']:<12.2f}"
                )
            lines.append(f"  Итого по разделу: {section['total_cost']:,.2f} руб.")

        lines.append("")
        lines.append("=" * 70)
        lines.append(f"  Стоимость работ:     {estimate.total_works:>15,.2f} руб.")
        lines.append(f"  Стоимость материалов:{estimate.total_materials:>15,.2f} руб.")
        if finance:
            lines.append(f"  Накладные расходы:   {finance.overhead_amount:>15,.2f} руб.")
            lines.append(f"  Сметная прибыль:     {finance.profit_amount:>15,.2f} руб.")
            if finance.vat_amount > 0:
                lines.append(f"  НДС ({finance.vat_percent}%):          {finance.vat_amount:>15,.2f} руб.")
        lines.append(f"  ИТОГО:               {estimate.final_price:>15,.2f} руб.")
        lines.append("=" * 70)

        content = "\n".join(lines)
        file_name = f"KP_{estimate.estimate_number}_{datetime.now().strftime('%Y%m%d')}.txt"
        file_path = os.path.join(self.output_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc = await self._save_document_record(
            estimate_id, DocumentType.KP, file_path, file_name
        )
        logger.info("Сгенерировано КП: %s", file_name)
        return doc

    # ------------------------------------------------------------------ #
    #  Договор                                                            #
    # ------------------------------------------------------------------ #
    async def generate_contract(self, estimate_id: uuid.UUID) -> Document:
        data = await self._load_estimate_full(estimate_id)
        estimate = data["estimate"]
        project = data["project"]
        client = data["client"]

        client_name = client.name if client else "________________________"
        contract_num = f"Д-{estimate.estimate_number}"

        lines = [
            f"ДОГОВОР ПОДРЯДА № {contract_num}",
            f"г. {project.city or 'Москва'}",
            f"«{datetime.now().strftime('%d')}» {datetime.now().strftime('%B %Y')} г.",
            "",
            "1. ПРЕДМЕТ ДОГОВОРА",
            f"1.1. Подрядчик обязуется выполнить работы: {project.name}",
            f"1.2. Адрес объекта: {project.address or '___'}",
            f"1.3. Стоимость работ: {estimate.final_price:,.2f} руб.",
            "",
            "2. СТОИМОСТЬ РАБОТ И ПОРЯДОК РАСЧЁТОВ",
            f"2.1. Общая стоимость: {estimate.final_price:,.2f} руб.",
            "2.2. Оплата поэтапная, по актам КС-2.",
            "",
            "3. СРОКИ",
            f"3.1. Начало: {project.start_date or '___'}",
            f"3.2. Окончание: {project.end_date or '___'}",
            "",
            "4. ОБЯЗАННОСТИ СТОРОН",
            "4.1. Подрядчик обязуется выполнить работы качественно.",
            "4.2. Заказчик обязуется принять и оплатить работы.",
            "",
            "5. ПОДПИСИ СТОРОН",
            f"Заказчик: {client_name}",
            "Подрядчик: ________________________",
        ]

        content = "\n".join(lines)
        file_name = f"CONTRACT_{contract_num}_{datetime.now().strftime('%Y%m%d')}.txt"
        file_path = os.path.join(self.output_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc = await self._save_document_record(
            estimate_id, DocumentType.CONTRACT, file_path, file_name
        )
        logger.info("Сгенерирован договор: %s", file_name)
        return doc

    # ------------------------------------------------------------------ #
    #  КС-2 — Акт о приёмке выполненных работ                            #
    # ------------------------------------------------------------------ #
    async def generate_ks2(self, estimate_id: uuid.UUID) -> Document:
        data = await self._load_estimate_full(estimate_id)
        estimate = data["estimate"]

        lines = [
            f"АКТ О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ (форма КС-2)",
            f"Смета № {estimate.estimate_number}",
            f"Дата: {datetime.now().strftime('%d.%m.%Y')}",
            "",
            f"{'№':<4} {'Наименование':<35} {'Ед.':<6} {'Кол.':<8} {'Цена':<10} {'Сумма':<12}",
            "-" * 80,
        ]

        row_num = 0
        total = 0.0
        for section in data["sections"]:
            lines.append(f"\n  Раздел: {section['name']}")
            for item in section["items"]:
                if item["completed_volume"] > 0:
                    row_num += 1
                    cost = round(
                        item["completed_volume"]
                        * (item["price_work"] + item["price_material"]),
                        2,
                    )
                    total += cost
                    lines.append(
                        f"  {row_num:<4} {item['name'][:35]:<35} {item['unit']:<6} "
                        f"{item['completed_volume']:<8.1f} "
                        f"{item['price_work'] + item['price_material']:<10.2f} "
                        f"{cost:<12.2f}"
                    )

        lines.append("")
        lines.append(f"ИТОГО выполнено: {total:,.2f} руб.")

        content = "\n".join(lines)
        file_name = f"KS2_{estimate.estimate_number}_{datetime.now().strftime('%Y%m%d')}.txt"
        file_path = os.path.join(self.output_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc = await self._save_document_record(
            estimate_id, DocumentType.KS2, file_path, file_name
        )
        logger.info("Сгенерирован КС-2: %s", file_name)
        return doc

    # ------------------------------------------------------------------ #
    #  КС-3 — Справка о стоимости выполненных работ                       #
    # ------------------------------------------------------------------ #
    async def generate_ks3(self, estimate_id: uuid.UUID) -> Document:
        data = await self._load_estimate_full(estimate_id)
        estimate = data["estimate"]
        finance = data["finance"]

        items_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())

        completed_work = sum(
            i.completed_volume * i.price_work for i in items
        )
        completed_material = sum(
            i.completed_volume * i.price_material for i in items
        )
        completed_total = completed_work + completed_material

        lines = [
            f"СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (форма КС-3)",
            f"Смета № {estimate.estimate_number}",
            f"Дата: {datetime.now().strftime('%d.%m.%Y')}",
            "",
            f"Стоимость по договору:     {estimate.final_price:>15,.2f} руб.",
            f"Выполнено работ:           {completed_work:>15,.2f} руб.",
            f"Материалы:                 {completed_material:>15,.2f} руб.",
            f"Итого выполнено:           {completed_total:>15,.2f} руб.",
            f"Остаток:                   {estimate.final_price - completed_total:>15,.2f} руб.",
        ]

        content = "\n".join(lines)
        file_name = f"KS3_{estimate.estimate_number}_{datetime.now().strftime('%Y%m%d')}.txt"
        file_path = os.path.join(self.output_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc = await self._save_document_record(
            estimate_id, DocumentType.KS3, file_path, file_name
        )
        return doc

    # ------------------------------------------------------------------ #
    #  М-29 — Отчёт о расходе материалов                                  #
    # ------------------------------------------------------------------ #
    async def generate_m29(self, estimate_id: uuid.UUID) -> Document:
        from services.material_calculator import MaterialCalculator

        calc = MaterialCalculator(self.db)
        summary = await calc.get_material_summary(estimate_id)
        estimate_result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = estimate_result.scalar_one()

        lines = [
            f"ОТЧЁТ О РАСХОДЕ МАТЕРИАЛОВ (форма М-29)",
            f"Смета № {estimate.estimate_number}",
            f"Дата: {datetime.now().strftime('%d.%m.%Y')}",
            "",
            f"{'№':<4} {'Наименование':<35} {'Ед.':<6} {'Кол-во':<10} {'Цена':<10} {'Сумма':<12}",
            "-" * 80,
        ]

        total_cost = 0.0
        for idx, mat in enumerate(summary, 1):
            lines.append(
                f"  {idx:<4} {mat['name'][:35]:<35} {mat['unit']:<6} "
                f"{mat['quantity']:<10.3f} {mat['price']:<10.2f} {mat['total']:<12.2f}"
            )
            total_cost += mat["total"]

        lines.append("-" * 80)
        lines.append(f"ИТОГО материалов: {total_cost:,.2f} руб.")

        content = "\n".join(lines)
        file_name = f"M29_{estimate.estimate_number}_{datetime.now().strftime('%Y%m%d')}.txt"
        file_path = os.path.join(self.output_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc = await self._save_document_record(
            estimate_id, DocumentType.M29, file_path, file_name
        )
        return doc

    # ------------------------------------------------------------------ #
    #  Счёт на оплату                                                     #
    # ------------------------------------------------------------------ #
    async def generate_invoice(
        self, estimate_id: uuid.UUID, *, payment_percent: float = 100.0,
    ) -> Document:
        data = await self._load_estimate_full(estimate_id)
        estimate = data["estimate"]
        client = data["client"]

        amount = round(estimate.final_price * payment_percent / 100, 2)

        lines = [
            f"СЧЁТ НА ОПЛАТУ",
            f"№ СЧ-{estimate.estimate_number}",
            f"от {datetime.now().strftime('%d.%m.%Y')}",
            "",
            f"Заказчик: {client.name if client else '___'}",
            "",
            f"Наименование: Работы по смете {estimate.estimate_number} — {estimate.name}",
            f"Сумма: {amount:,.2f} руб.",
            f"({payment_percent}% от стоимости {estimate.final_price:,.2f} руб.)",
            "",
            "Реквизиты для оплаты:",
            "Р/с: ________________________________",
            "БИК: ________________________________",
        ]

        content = "\n".join(lines)
        file_name = f"INVOICE_{estimate.estimate_number}_{datetime.now().strftime('%Y%m%d')}.txt"
        file_path = os.path.join(self.output_dir, file_name)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)

        doc = await self._save_document_record(
            estimate_id, DocumentType.INVOICE, file_path, file_name
        )
        return doc

    # ------------------------------------------------------------------ #
    #  Все документы одним вызовом                                        #
    # ------------------------------------------------------------------ #
    async def generate_all(self, estimate_id: uuid.UUID) -> list[Document]:
        docs = [
            await self.generate_kp(estimate_id),
            await self.generate_contract(estimate_id),
            await self.generate_ks2(estimate_id),
            await self.generate_ks3(estimate_id),
            await self.generate_m29(estimate_id),
            await self.generate_invoice(estimate_id),
        ]
        logger.info("Сгенерированы все документы для сметы %s", estimate_id)
        return docs
