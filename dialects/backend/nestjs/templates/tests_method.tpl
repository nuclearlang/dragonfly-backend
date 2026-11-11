{{#decor.test}}it({{decor.test.args}}, async () => {
  {{body}}
});{{/decor.test}}{{^decor.test}}{{#async}}async {{/async}}function {{name}}({{params}}){{#ret}}: {{ret}}{{/ret}} {
  {{body}}
}{{/decor.test}}
