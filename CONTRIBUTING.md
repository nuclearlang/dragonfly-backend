# Contributing to dragonfly-backend

Thank you for helping. This repository is part of [NuclearLang](https://github.com/nuclearlang): the language is the
[nuclear](https://github.com/nuclearlang/nuclear) repository, and the other repositories live as folders inside a clone of it, each with its
own git (the tools find each other that way).

## Set up

```sh
git clone https://github.com/nuclearlang/nuclear && cd nuclear
git clone https://github.com/nuclearlang/dragonfly-backend
(cd tools/node && npm install)                    # the shared Node tools of the checks
python3 -m venv tools/python/.venv && tools/python/.venv/bin/pip install -r tools/python/requirements.txt
./install.sh
```

## Before a pull request

```sh
(cd .. && cargo test)                 # the examples with both dialects, the goldens
sh tools/fastapi-check/check.sh       # pyright --strict, pytest, migrations, a live run
sh tools/nestjs-check/check.sh        # tsc --strict, node:test, migrations, a live run
```

- Everything is written in English: code, comments, docs and messages.
- A change that the user of NuclearLang can see updates its documentation in the same pull request (the spec of
  the area, the guide, `docs/context/` for agents and contributors).
- Rules and the reasons behind them: the [nuclear repository's AGENTS.md](https://github.com/nuclearlang/nuclear/blob/main/AGENTS.md) and its
  [decision records](https://github.com/nuclearlang/nuclear/tree/main/docs/adr).

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE).
