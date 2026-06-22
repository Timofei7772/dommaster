"""
Парсер YouDo — поиск заказов на ремонт
"""

from typing import List, Optional
from app.leads.base_parser import BaseParser, Lead

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


class YouDoParser(BaseParser):
    source_name = "youdo"
    base_url = "https://youdo.com"

    async def search(self, query: str, location: str = "", limit: int = 20) -> List[Lead]:
        """Поиск заданий на YouDo"""
        if not HAS_BS4:
            self.logger.warning("beautifulsoup4 не установлен")
            return []

        url = f"{self.base_url}/tasks/categories/remont/"
        html = await self._fetch(url)
        if not html:
            return []

        leads = []
        soup = BeautifulSoup(html, "lxml" if HAS_BS4 else "html.parser")

        task_elements = soup.select("[class*='task'], [class*='TaskCard']")
        for el in task_elements[:limit]:
            try:
                title = el.select_one("[class*='title'], h3, h4")
                desc = el.select_one("[class*='description'], [class*='text'], p")
                price = el.select_one("[class*='price'], [class*='budget']")
                link = el.select_one("a")

                price_val = None
                if price:
                    import re
                    numbers = re.findall(r'\d+', price.get_text().replace(' ', ''))
                    if numbers:
                        price_val = float(numbers[0])

                if title:
                    leads.append(Lead(
                        source=self.source_name,
                        title=title.get_text(strip=True),
                        description=desc.get_text(strip=True) if desc else "",
                        url=self.base_url + link.get("href", "") if link else None,
                        price=price_val,
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
        description = soup.select_one("[class*='description']")

        return Lead(
            source=self.source_name,
            title=title.get_text(strip=True) if title else "",
            description=description.get_text(strip=True) if description else "",
            url=url,
        )
