{{decorators}}export const {{name}} = Annotation.Root({
{{#fields}}
  {{name}}: {{#tinfo.is.Messages}}Messages(){{/tinfo.is.Messages}}{{^tinfo.is.Messages}}Annotation<{{type}}>{{/tinfo.is.Messages}},
{{/fields}}
});
export type {{name}} = typeof {{name}}.State;
