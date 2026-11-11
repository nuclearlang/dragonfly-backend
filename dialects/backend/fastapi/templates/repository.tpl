{{decorators}}class {{name}}(Repository[{{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}]):
    {{#doc}}{{doc}}

    {{/doc}}{{#body}}{{body}}{{/body}}{{^body}}{{^doc}}pass{{/doc}}{{/body}}
