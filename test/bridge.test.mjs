import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../web/bridge.js', import.meta.url), 'utf8');
function setup(sdk, options = {}) {
  const timers = new Map(); let timerId = 0;
  const context = vm.createContext({ TextEncoder, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  const bridge = context.EVEToyCreateBridge(() => sdk, {
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id), ...options
  });
  return { bridge, timers };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('SDK is called synchronously; completion is consumed once', async () => {
  let invoked = false;
  const { bridge } = setup({ getCloudStorage(keys) { invoked = true; assert.deepEqual(Array.from(keys), ['coins']); return Promise.resolve({ coins: '5' }); } });
  const token = bridge.begin('getCloudStorage', '[["coins"]]');
  assert.equal(invoked, true);
  assert.equal(bridge.poll(token).state, 'pending');
  await flush();
  const packet = bridge.poll(token);
  assert.equal(packet.schema, 'evengine.toy.request');
  assert.equal(packet.version, 1);
  assert.equal(packet.state, 'succeeded');
  assert.equal(packet.value.coins, '5');
  assert.equal(bridge.poll(token).error.type, 'stale_handle');
});
test('missing provider, unknown methods, invalid JSON and malformed arguments are observable', () => {
  const { bridge } = setup(undefined);
  for (const [method, args, type] of [
    ['getUserProfile','[]','unsupported'], ['constructor','[]','unsupported'],
    ['getCloudStorage','{','bridge_error'], ['getCloudStorage','{}','invalid_param']
  ]) assert.equal(bridge.poll(bridge.begin(method, args)).error.type, type);
});
test('rate-limit code is preserved without automatic retries', async () => {
  let calls = 0;
  const { bridge } = setup({ submitScore() { calls++; return Promise.reject({ type:'http_error', code:307044, message:'rate limited' }); } });
  const token = bridge.begin('submitScore', '[{"board":1,"score":42}]');
  await flush();
  assert.equal(bridge.poll(token).error.code, 307044);
  assert.equal(calls, 1);
});
test('cancellation and timeout cannot republish late results or reuse token identity', async () => {
  let complete;
  const { bridge, timers } = setup({ getMyRank() { return new Promise(resolve => { complete = resolve; }); } });
  const cancelled = bridge.begin('getMyRank', '[]');
  assert.equal(bridge.cancel(cancelled), true);
  assert.equal(bridge.cancel(cancelled), false);
  complete({ score: 10 }); await flush();
  assert.equal(bridge.poll(cancelled).error.type, 'stale_handle');
  const timed = bridge.begin('getMyRank', '[]');
  assert.ok(timed > cancelled);
  [...timers.values()][0]();
  complete({ score: 20 }); await flush();
  assert.equal(bridge.poll(timed).error.type, 'timeout');
});
test('request and response budgets are bounded', async () => {
  const { bridge } = setup({ getCloudStorage: () => Promise.resolve('x'.repeat(270000)) }, { maxRequests: 1 });
  const token = bridge.begin('getCloudStorage', '[]');
  assert.equal(bridge.begin('getCloudStorage', '[]'), 0);
  await flush();
  assert.equal(bridge.poll(token).error.type, 'response_too_large');
  assert.equal(bridge.begin('getCloudStorage', 'x'.repeat(270000)), 0);
});
