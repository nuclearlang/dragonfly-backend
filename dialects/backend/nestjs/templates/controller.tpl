{{decorators}}@Controller({{#decor.controller.arg}}{{decor.controller.arg}}{{/decor.controller.arg}}{{^decor.controller.arg}}'{{name|strip_suffix:"Controller"|kebab}}'{{/decor.controller.arg}})
export class {{name}} {
  {{body}}
}
