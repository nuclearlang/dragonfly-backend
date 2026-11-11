{{decorators}}@Injectable()
export class {{name}} extends Tools {
  {{body}}

  /** The tools the model can call: the methods with a doc comment. */
  tools(): StructuredToolInterface[] {
    return [
{{#methods}}
{{#doc_text}}
      tool(async ({{#params_list}}{{#@first}}{ {{/@first}}{{name}}{{^@last}}, {{/@last}}{{#@last}} }{{/@last}}{{/params_list}}) => this.{{name}}({{#params_list}}{{name}}{{^@last}}, {{/@last}}{{/params_list}}), {
        name: '{{name}}',
        description: {{doc_literal}},
        schema: z.object({ {{#params_list}}{{name}}: z.{{#tinfo.is.string}}string(){{/tinfo.is.string}}{{#tinfo.is.int}}number().int(){{/tinfo.is.int}}{{#tinfo.is.double}}number(){{/tinfo.is.double}}{{#tinfo.is.number}}number(){{/tinfo.is.number}}{{#tinfo.is.boolean}}boolean(){{/tinfo.is.boolean}}{{#tinfo.list}}array(z.any()){{/tinfo.list}}{{#optional}}.optional(){{/optional}}{{^optional}}{{#default}}.optional(){{/default}}{{/optional}}{{^@last}}, {{/@last}}{{/params_list}} }),
      }),
{{/doc_text}}
{{/methods}}
    ];
  }
}
