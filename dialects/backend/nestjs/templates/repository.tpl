{{decorators}}@Injectable()
{{#deco_args.path}}export class {{name}} extends HttpRepository {
  override path = {{deco_args.path}};{{#deco_args.connection}}
  override connectionName = {{deco_args.connection}};{{/deco_args.connection}}
{{#members}}

  {{members}}
{{/members}}
}{{/deco_args.path}}{{^deco_args.path}}export class {{name}} extends Repository<{{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}> {
  constructor(@InjectModel({{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}) model: typeof {{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}) {
    super(model);
  }
{{#members}}

  {{members}}
{{/members}}
}{{/deco_args.path}}
