{{decorators}}@Injectable()
export class {{name}} extends Repository<{{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}> {
  constructor(@InjectModel({{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}) model: typeof {{#decor.repository.arg}}{{decor.repository.arg}}{{/decor.repository.arg}}{{^decor.repository.arg}}{{name|strip_suffix:"Repository"}}{{/decor.repository.arg}}) {
    super(model);
  }
{{#members}}

  {{members}}
{{/members}}
}
