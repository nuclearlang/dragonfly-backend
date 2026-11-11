{{decorators}}{{#async}}async {{/async}}{{name}}({{params}}){{#ret}}: {{^async}}Promise<{{/async}}{{ret}}{{^async}}>{{/async}}{{/ret}} {
  const q = this.query();
  {{body}}
}
