"""
Парсер Profi.ru — поиск заявок на ремонт
"""

from typing import List, Optional
from app.leads.base_parser import BaseParser, Lead

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


class ProfiParser(BaseParser):
    source_name = "profi"
    base_url = "https://profi.ru"

    async def search(self, query: str, location: str = "москва", limit: int = 20) -> List[Lead]:
        """Поиск заказов на Profi.ru"""
        if not HAS_BS4:
            self.logger.warning("beautifulsoup4 не установлен")
            return []

        # Profi.ru использует API / динамическую загрузку
        # Базовый парсинг страницы категории
        url = f"{self.base_url}/remont-kvartir/"
        html = await self._fetch(url)
        if not html:
            return []

        leads = []
        soup = BeautifulSoup(html, "lxml" if HAS_BS4 else "html.parser")

        # Profi.ru может менять структуру — адаптивный парсинг
        order_elements = soup.select("[class*='order'], [class*='task'], [class*='request']")
        for el in order_elements[:limit]:
            try:
                title = el.select_one("h3, h4, [class*='title']")
                desc = el.select_one("p, [class*='description'], [class*='text']")
                link = el.select_one("a")

                if title:
                    leads.append(Lead(
                        source=self.source_name,
                        title=title.get_text(strip=True),
                        description=desc.get_text(strip=True) if desc else "",
                        url=self.base_url + link.get("href", "") if link else None,
                        location=location,
                    ))
            except Exception:
                continue

        return leads

    async def parse_listing(self, url: str) -> Optional[Lead]:
        if not HAS_BS4:
            return None

        html = await self._fetch(url)
        if not html:
            return None

        soup = BeautifulSoup(html, "lxml" if HAS_BS4 else "html.parser")
        title = soup.select_one("h1")
        description = soup.select_one("[class*='description'], [class*='content']")

        return Lead(
            source=self.source_name,
            title=title.get_text(strip=True) if title else "",
            description=description.get_text(strip=True) if description else "",
            url=url,
        )
