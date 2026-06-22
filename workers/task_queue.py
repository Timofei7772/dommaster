"""
Очередь задач через RabbitMQ (aio-pika).
"""
import json
import logging
from typing import Callable, Optional, Any

import aio_pika
from aio_pika.abc import AbstractRobustConnection

from config import RabbitMQConfig

logger = logging.getLogger(__name__)


class TaskQueue:
    def __init__(self, config: RabbitMQConfig):
        self.config = config
        self.connection: Optional[AbstractRobustConnection] = None
        self.channel = None

    async def connect(self) -> None:
        try:
            self.connection = await aio_pika.connect_robust(self.config.url)
            self.channel = await self.connection.channel()
            await self.channel.set_qos(prefetch_count=10)
            logger.info("Подключено к RabbitMQ: %s", self.config.url)
        except Exception:
            logger.warning("Не удалось подключиться к RabbitMQ, очередь задач недоступна")
            self.connection = None
            self.channel = None

    async def disconnect(self) -> None:
        if self.connection:
            await self.connection.close()
            logger.info("Отключено от RabbitMQ")

    async def publish(
        self,
        queue_name: str,
        task_data: dict,
        *,
        priority: int = 0,
    ) -> None:
        if not self.channel:
            logger.warning("RabbitMQ не подключён, задача не отправлена")
            return

        queue = await self.channel.declare_queue(queue_name, durable=True)
        message = aio_pika.Message(
            body=json.dumps(task_data).encode(),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            priority=priority,
        )
        await self.channel.default_exchange.publish(message, routing_key=queue_name)
        logger.info("Задача отправлена в %s", queue_name)

    async def consume(
        self,
        queue_name: str,
        handler: Callable,
    ) -> None:
        if not self.channel:
            logger.warning("RabbitMQ не подключён, consumer не запущен")
            return

        queue = await self.channel.declare_queue(queue_name, durable=True)

        async def on_message(message: aio_pika.IncomingMessage):
            async with message.process():
                try:
                    data = json.loads(message.body.decode())
                    await handler(data)
                except Exception:
                    logger.exception("Ошибка обработки задачи из %s", queue_name)

        await queue.consume(on_message)
        logger.info("Consumer запущен для %s", queue_name)
