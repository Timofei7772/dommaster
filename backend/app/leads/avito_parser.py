"""
Парсер Avito — поиск заявок на строительные работы
"""

from typing import List, Optional
from app.leads.base_parser import BaseParser, Lead

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


class AvitoParser(BaseParser):
    source_name = "avito"
    base_url = "https://www.avito.ru"

    async def search(self, query: str, location: str = "moskva", limit: int = 20) -> List[Lead]:
        """Поиск объявлений на Avito"""
        if not HAS_BS4:
            self.logger.warning("beautifulsoup4 не установлен")
            return []

        url = f"{self.base_url}/{location}/predlozheniya_uslug/remont_i_stroitelstvo"
        params = {"q": query, "p": 1}

        html = await self._fetch(url, params)
        if not html:
            return []

        leads = []
        soup = BeautifulSoup(html, "lxml" if HAS_BS4 else "html.parser")

        items = soup.select("[data-marker='item']")
        for item in items[:limit]:
            try:
                title_el = item.select_one("[itemprop='name']")
                price_el = item.select_one("[itemprop='price']")
                link_el = item.select_one("a[itemprop='url']")
                desc_el = item.select_one("[class*='description']")

                title = title_el.get_text(strip=True) if title_el else ""
                price_val = float(price_el.get("content", 0)) if price_el else None
                link = self.base_url + link_el.get("href", "") if link_el else None
                desc = desc_el.get_text(strip=True) if desc_el else ""

                if title:
                    leads.append(Lead(
                        source=self.source_name,
                        title=title,
                        description=desc or title,
                        url=link,
                        price=price_val,
                        location=location,
                    ))
            except Exception as e:
                self.logger.debug(f"Ошибка парсинга элемента: {e}")
                continue

        return leads

    async def parse_listing(self, url: str) -> Optional[Lead]:
        """Парсинг отдельного объявления Avito"""
        if not HAS_BS4:
            return None

        html = await self._fetch(url)
        if not html:
            return None

        soup = BeautifulSoup(html, "lxml" if HAS_BS4 else "html.parser")

        title = soup.select_one("h1")
        description = soup.select_one("[itemprop='description']")
        price = soup.select_one("[itemprop='price']")

        return Lead(
            source=self.source_name,
            title=title.get_text(strip=True) if title else "",
            description=description.get_text(strip=True) if description else "",
            url=url,
            price=float(price.get("content", 0)) if price else None,
        )
