# Changelog

All notable changes to dragonfly-backend are written here; versions follow [Semantic Versioning](https://semver.org).

## Unreleased

- First public version.
- HTTP repositories (`Http` connection, bodiless `@get`/`@post`...) in fastapi and nestjs; `@key` for a JSON key that differs from the field; `[[generators]]` for `dragonfly gen` (ADR-0103).
- `[[generators.usecase]]`: `dragonfly gen usecase` writes a use case over a repository method, its alias in the facade and its route (ADR-0103).
- The order of a controller's routes no longer matters, in both dialects: a fixed segment wins over a parameter. Before, fastapi added the routes by method name (`GET <prefix>/search` of a generated resource answered 400, taken by `{id}`) and nestjs in the order written (`dragonfly-py` `router_of`, `dragonfly-nest` `configureApp`; `spec/backend.md` §2.7).
- `[[generators.resource]]`: the repository and the controller are merged (`merge = true`), so an action added to a resource that exists gets the members it lacks (ADR-0105).
