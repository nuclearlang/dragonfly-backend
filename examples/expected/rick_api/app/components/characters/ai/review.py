from __future__ import annotations

from app.components.characters.ai.guide import Guide
from app.components.characters.ai.states.review_state import ReviewState
from dragonfly.ai import Graph, next, start


class Review(Graph[ReviewState]):
    """Asks the guide, then judges the answer."""

    state = ReviewState

    def __init__(self, guide: Guide) -> None:
        self.guide = guide

    @start
    @next("judge")
    async def ask(self, state: ReviewState) -> dict[str, str]:
        answer = await self.guide.ask(state.question)
        return {"answer": answer}

    @next("end")
    def judge(self, state: ReviewState) -> dict[str, str]:
        verdict = "answered" if len(state.answer) > 0 else "empty"
        return {"verdict": verdict}
