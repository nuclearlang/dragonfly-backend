{{decorators}}@Injectable()
export class {{name}} extends Graph<typeof {{decor.state.arg}}> {
  readonly state = {{decor.state.arg}};{{#body}}

  {{body}}{{/body}}
}
