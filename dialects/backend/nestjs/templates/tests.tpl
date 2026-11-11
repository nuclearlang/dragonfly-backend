{{decorators}}describe('{{name}}', () => {
  let app: INestApplication;

  beforeEach(async () => {
    app = await startTestApp(AppModule);
  });

  afterEach(async () => {
    await stopTestApp(app);
  });

  {{body}}
});
