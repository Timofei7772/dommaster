"""
Базовый класс парсера площадок
"""

from typing import List, Dict, Any, Optional
from abc import ABC, abstractmethod
from datetime import datetime
import logging
import httpx

logger = logging.getLogger(__name__)


class Lead:
    """Лид (заявка)"""

    def __init__(
        self,
        source: str,
        title: str,
        description: str,
        url: Optional[str] = None,
        price: Optional[float] = None,
        location: Optional[str] = None,
        contact: Optional[str] = None,
        raw_data: Optional[Dict] = None,
    ):
        self.source = source
        self.title = title
        self.description = description
        self.url = url
        self.price = price
        self.location = location
        self.contact = contact
        self.raw_data = raw_data or {}
        self.parsed_at = datetime.utcnow()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source": self.source,
            "title": self.title,
            "description": self.description,
            "url": self.url,
            "price": self.price,
            "location": self.location,
            "contact": self.contact,
            "parsed_at": self.parsed_at.isoformat(),
        }


class BaseParser(ABC):
    """Базовый парсер площадки"""

    source_name: str = "unknown"
    base_url: str = ""

    def __init__(self):
        self.logger = logging.getLogger(f"leads.{self.source_name}")
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

    @abstractmethod
    async def search(self, query: str, location: str = "", limit: int = 20) -> List[Lead]:
        """Поиск заявок по запросу"""
        pass

    @abstractmethod
    async def parse_listing(self, url: str) -> Optional[Lead]:
        """Парсинг отдельного объявления"""
        pass

    async def _fetch(self, url: str, params: Dict = None) -> Optional[str]:
        """HTTP-запрос"""
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                return response.text
        except Exception as e:
            self.logger.error(f"Ошибка запроса {url}: {e}")
            return None
