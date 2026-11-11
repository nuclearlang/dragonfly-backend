{{decorators}}class {{name}}(Entity):
    {{#doc}}{{doc}}

    {{/doc}}__tablename__ = {{#decor.entity.arg}}{{decor.entity.arg}}{{/decor.entity.arg}}{{^decor.entity.arg}}"{{name|snake}}"{{/decor.entity.arg}}

    {{body}}
