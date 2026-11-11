{{decorators}}export class {{name}} {
  {{body}}{{#body}}

{{/body}}
  constructor(values: Partial<{{name}}> = {}) {
    Object.assign(this, values);
  }
}
