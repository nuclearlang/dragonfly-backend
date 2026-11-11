from __future__ import annotations

from app.components.characters.ai.guide import Guide
from app.components.characters.domain.models.question import Answer, Question
from dragonfly import controller, post


@controller("guide")
class GuideController:
    def __init__(self, guide: Guide) -> None:
        self.guide = guide

    @post("ask")
    async def ask(self, input: Question) -> Answer:
        return Answer(text=await self.guide.ask(input.text))
