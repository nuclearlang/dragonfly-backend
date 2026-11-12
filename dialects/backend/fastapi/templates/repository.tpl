{{decorators}}{{#deco_args.path}}class {{name}}(HttpRepository):
    {{#doc}}{{doc}}

    {{/doc}}path = {{deco_args.path}}{{#deco_args.connection}}
    connection_name = {{deco_args.connection}}{{/deco_args.connection}}
{{#body}}

    {{body}}{{/body}}{{/deco_args.path}}{{^deco_args.path}}class {{name}}(Repository[{{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}]):
    {{#doc}}{{doc}}

    {{/doc}}{{#body}}{{body}}{{/body}}{{^body}}{{^doc}}pass{{/doc}}{{/body}}{{/deco_args.path}}
