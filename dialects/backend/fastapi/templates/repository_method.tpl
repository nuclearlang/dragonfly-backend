{{decorators}}{{#async}}async def {{name}}(self{{#params}}, {{params}}{{/params}}){{#ret}} -> {{ret}}{{/ret}}:{{/async}}{{^async}}def {{name}}(self{{#params}}, {{params}}{{/params}}){{#ret}} -> Awaitable[{{ret}}]{{/ret}}:{{/async}}
    {{#doc}}{{doc}}
    {{/doc}}q = self.query()
    {{body}}
