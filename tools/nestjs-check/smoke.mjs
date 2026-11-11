// End-to-end check of a built nestjs project (examples/examples-backend/tasks_api): the REST CRUD over SQLite in
// memory, validation, the errors of a Result. Run: node smoke.mjs <build folder>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.DRAGONFLY_DATABASE = 'memory';
const build = path.resolve(process.argv[2]);
const { AppModule } = await import(pathToFileURL(path.join(build, 'dist/src/app.module.js')).href);
const { createApp } = await import(pathToFileURL(path.join(build, 'node_modules/dragonfly-nest/dist/index.js')).href);
const app = await createApp(AppModule);
await app.listen(0);
const base = await app.getUrl();
const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return [r.status, await r.json()];
};
try {
  let [status, task] = await call('POST', '/tasks', { title: 'Buy milk', priority: 1 });
  assert.equal(status, 201);
  assert.equal(task.title, 'Buy milk');
  assert.equal(task.done, false);
  assert.equal((await call('POST', '/tasks', { title: 'Buy milk' }))[0], 409);
  const [bad, why] = await call('POST', '/tasks', { title: '', priority: 7 });
  assert.equal(bad, 400);
  assert.equal(why.message.length, 2);
  [status, task] = await call('PATCH', `/tasks/${task.id}`, { done: true });
  assert.equal(status, 200);
  assert.equal(task.done, true);
  assert.deepEqual((await call('GET', '/tasks?done=false'))[1], []);
  assert.equal((await call('GET', '/tasks/99'))[0], 404);
  assert.deepEqual((await call('DELETE', `/tasks/${task.id}`))[1], { id: task.id });
  assert.equal((await call('DELETE', `/tasks/${task.id}`))[0], 404);
  console.log('smoke: REST CRUD, validation and Result errors ok');
} finally {
  await app.close();
}
