"""AI: tools, agents and graphs over LangChain and LangGraph. The models are connections of the configuration
(OpenAI, Ollama, Embeddings, Chroma), named in each kind: `model = "default"`."""

from __future__ import annotations

import inspect
from collections.abc import AsyncIterator, Callable
from typing import Annotated, Any, cast

from langchain_core.messages import AnyMessage, BaseMessage
from langchain_core.tools import BaseTool, StructuredTool
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from .app import connection
from .config import ChatModel, Chroma

__all__ = ["Tools", "Agent", "Graph", "Messages", "start", "next", "chat_model", "vector_store", "text_of"]

Messages = Annotated[list[AnyMessage], add_messages]
"""A state field with the conversation: new messages are appended (LangGraph add_messages)."""


def chat_model(name: str = "default") -> Any:
    """The chat model of the configuration with that name (a LangChain BaseChatModel)."""
    return connection(ChatModel, name).client


def vector_store(name: str = "default") -> Any:
    """The Chroma vector store of the configuration with that name (a LangChain VectorStore)."""
    return connection(Chroma, name).store


def text_of(message: BaseMessage | Any) -> str:
    """The text of a model's answer."""
    content = getattr(message, "content", message)
    if isinstance(content, list):
        parts = cast(list[Any], content)
        return "".join(p if isinstance(p, str) else str(p.get("text", "")) for p in parts)
    return str(content)


class Tools:
    """A `tools` kind: each public method with a doc comment is a tool the model can call (the doc comment is what the
    model reads); a method without one is a helper of the others."""

    def tools(self) -> list[BaseTool]:
        out: list[BaseTool] = []
        for name in dir(type(self)):
            if name.startswith("_") or hasattr(Tools, name):
                continue
            fn = getattr(self, name)
            if not callable(fn):
                continue
            doc = fn.__doc__
            if not doc:
                continue
            doc = inspect.cleandoc(doc)
            if inspect.iscoroutinefunction(fn):
                out.append(StructuredTool.from_function(coroutine=fn, name=name, description=doc))
            else:
                out.append(StructuredTool.from_function(func=fn, name=name, description=doc))
        return out


class Agent:
    """An `agent` kind: a model with tools and a system prompt (LangChain create_agent). Its tools are the `tools`
    it receives in its constructor. `ask` keeps the conversation of each `thread`."""

    model: str = "default"
    prompt: str = ""

    _graph: Any = None

    def graph(self) -> Any:
        if self._graph is None:
            from langchain.agents import create_agent

            tools = [t for v in vars(self).values() if isinstance(v, Tools) for t in v.tools()]
            self._graph = create_agent(
                chat_model(self.model), tools, system_prompt=self.prompt or None, checkpointer=InMemorySaver()
            )
        return self._graph

    async def ask(self, text: str, thread: str = "default") -> str:
        """The agent's answer to `text`, in the conversation `thread`."""
        out = await self.graph().ainvoke(
            {"messages": [{"role": "user", "content": text}]}, {"configurable": {"thread_id": thread}}
        )
        return text_of(out["messages"][-1])

    async def stream(self, text: str, thread: str = "default") -> AsyncIterator[str]:
        """The answer token by token."""
        async for chunk, _ in self.graph().astream(
            {"messages": [{"role": "user", "content": text}]},
            {"configurable": {"thread_id": thread}},
            stream_mode="messages",
        ):
            if text_of(chunk):
                yield text_of(chunk)


def start[F: Callable[..., Any]](fn: F) -> F:
    """@start: the first node of a graph."""
    fn.__dragonfly_start__ = True  # type: ignore[attr-defined]
    return fn


def next[F: Callable[..., Any]](node: str) -> Callable[[F], F]:  # noqa: A001 - the name the kind writes
    """@next("node"): after this node, that one ("end" ends the graph). A node may also return
    Command(goto = "node", update = {...}) to choose at run time."""

    def mark(fn: F) -> F:
        fn.__dragonfly_next__ = node  # type: ignore[attr-defined]
        return fn

    return mark


class Graph[S]:
    """A `graph` kind: its methods are the nodes of a LangGraph StateGraph over the state `S`. Each node receives
    the state and returns what changes."""

    state: type[Any]
    _compiled: Any = None

    def compiled(self) -> Any:
        if self._compiled is None:
            g: Any = StateGraph(self.state)
            first = None
            for name in dir(type(self)):
                fn = getattr(type(self), name, None)
                if name.startswith("_") or hasattr(Graph, name) or not inspect.isfunction(fn):
                    continue
                g.add_node(name, getattr(self, name))
                if getattr(fn, "__dragonfly_start__", False):
                    first = name
                target = getattr(fn, "__dragonfly_next__", None)
                if target is not None:
                    g.add_edge(name, END if target == "end" else target)
            if first is None:
                raise ValueError(f"{type(self).__name__}: mark the first node with @start")
            g.add_edge(START, first)
            self._compiled = g.compile(checkpointer=InMemorySaver())
        return self._compiled

    async def run(self, state: dict[str, Any], thread: str = "default") -> dict[str, Any]:
        """Runs the graph from `state` until it ends; the final state."""
        return await self.compiled().ainvoke(state, {"configurable": {"thread_id": thread}})
