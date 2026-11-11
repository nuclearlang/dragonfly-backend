from __future__ import annotations

from app.components.characters.ai.character_tools import CharacterTools
from dragonfly.ai import Agent


class Guide(Agent):
    """Answers questions about the characters, with the tools."""

    prompt: str = "You answer questions about Rick and Morty characters. Use the tools; be brief."

    def __init__(self, tools: CharacterTools) -> None:
        self.tools = tools
