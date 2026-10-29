import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../web/probe.js', import.meta.url), 'utf8');
async function probe(properties, threads = true) {
  const context = vm.createContext(properties); vm.runInContext(source, context);
  return context.EVEToyProbe(threads);
}
test('GPU API presence alone is not sufficient', async () => {
  const report = await probe({ isSecureContext:true, navigator:{ gpu:{ requestAdapter:async()=>null } } });
  assert.equal(report.canStart, false);
  assert.ok(report.errors.length >= 2);
});
test('successful device must be released; thread capability is explicit', async () => {
  let destroyed = 0;
  const properties = { isSecureContext:true, crossOriginIsolated:true, SharedArrayBuffer,
    navigator:{ gpu:{ requestAdapter:async()=>({ requestDevice:async()=>({ destroy(){ destroyed++; } }) }) } } };
  assert.equal((await probe(properties)).canStart, true);
  assert.equal(destroyed, 1);
  assert.equal((await probe({ ...properties, crossOriginIsolated:false })).canStart, false);
  assert.equal((await probe({ ...properties, crossOriginIsolated:false }, false)).canStart, true);
});
