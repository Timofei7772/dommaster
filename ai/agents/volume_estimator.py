"""
VolumeEstimatorAgent — расчёт объёмов работ по параметрам помещений.
"""
import logging
import math

from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class VolumeEstimatorAgent(BaseAgent):

    async def estimate(
        self,
        rooms: list[dict],
        works: list[dict] | None = None,
    ) -> dict:
        """
        Рассчитать объёмы для каждого помещения.
        Возвращает dict: room_name → volumes.
        """
        volumes = {}

        for room in rooms:
            name = room.get("name", "Помещение")
            area = room.get("area", 0)
            perimeter = room.get("perimeter", 0)
            ceiling_height = room.get("ceiling_height", 2.7)
            has_wet_zone = room.get("has_wet_zone", False)

            # Если периметр не указан — считаем по площади
            if perimeter <= 0 and area > 0:
                side = math.sqrt(area)
                perimeter = round(side * 4, 1)

            wall_area = room.get("wall_area", 0)
            if wall_area <= 0:
                wall_area = round(perimeter * ceiling_height, 1)

            # Вычитаем проёмы (≈ 10% стен)
            wall_area_net = round(wall_area * 0.9, 1)

            # Площадь дверных проёмов (≈ 2 м² на дверь, 1 дверь на комнату)
            door_count = 1
            door_area = door_count * 2.0

            # Площадь оконных проёмов
            window_area = 0.0
            if not has_wet_zone and area > 5:
                window_area = round(area * 0.12, 1)  # ≈ 12% от площади пола

            volumes[name] = {
                "floor_area": round(area, 1),
                "ceiling_area": round(area, 1),
                "wall_area": round(wall_area, 1),
                "wall_area_net": round(wall_area_net - door_area - window_area, 1),
                "perimeter": round(perimeter, 1),
                "ceiling_height": ceiling_height,
                "door_count": door_count,
                "door_area": door_area,
                "window_area": round(window_area, 1),
                "has_wet_zone": has_wet_zone,
                "volume_m3": round(area * ceiling_height, 1),
                # Плинтус
                "baseboard_length": round(perimeter - 0.9 * door_count, 1),
            }

        logger.info(
            "VolumeEstimator: рассчитано %d помещений",
            len(volumes),
        )
        return volumes
