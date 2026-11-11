{{decorators}}class {{name}}(BaseModel):
    {{#doc}}{{doc}}

    {{/doc}}{{#body}}{{body}}{{/body}}{{^body}}{{^doc}}pass{{/doc}}{{/body}}
