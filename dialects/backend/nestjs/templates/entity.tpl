{{decorators}}@Table({
  tableName: {{#decor.entity.arg}}{{decor.entity.arg}}{{/decor.entity.arg}}{{^decor.entity.arg}}'{{name|snake}}'{{/decor.entity.arg}},
  underscored: true,
  timestamps: {{#field_decor.created}}true{{/field_decor.created}}{{^field_decor.created}}{{#field_decor.updated}}true{{/field_decor.updated}}{{^field_decor.updated}}false{{/field_decor.updated}}{{/field_decor.created}},{{#field_decor.created}}
  createdAt: '{{field_decor.created}}',{{/field_decor.created}}{{^field_decor.created}}{{#field_decor.updated}}
  createdAt: false,{{/field_decor.updated}}{{/field_decor.created}}{{#field_decor.updated}}
  updatedAt: '{{field_decor.updated}}',{{/field_decor.updated}}{{^field_decor.updated}}{{#field_decor.created}}
  updatedAt: false,{{/field_decor.created}}{{/field_decor.updated}}
})
export class {{name}} extends Entity {
  {{body}}
}
