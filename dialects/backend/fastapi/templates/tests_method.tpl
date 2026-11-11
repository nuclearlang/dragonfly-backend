{{#decor.test}}async def test_{{name|snake}}(self) -> None:
    {{decor.test.args}}
    {{body}}{{/decor.test}}{{^decor.test}}{{#async}}async {{/async}}def {{name}}(self{{#params}}, {{params}}{{/params}}){{#ret}} -> {{ret}}{{/ret}}:
    {{body}}{{/decor.test}}
