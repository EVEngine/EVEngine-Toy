import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { doctor, disjoint, exportPackage, exportProbe } from '../lib/package.mjs';

async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'eve-toy-test-'));
  t.after(() => rm(parent, { recursive:true, force:true }));
  const input = path.join(parent, 'input'); await mkdir(input);
  return { parent, input, output:path.join(parent, 'output') };
}
async function runtime(input) {
  await writeFile(path.join(input, 'eve.html'), '<template id="engine-entry"><script src="./eve.js"></script></template><script src="./toy-boot.js"></script>');
  await writeFile(path.join(input, 'eve.js'), 'globalThis.EVEToyBridge; // pthread');
  await writeFile(path.join(input, 'eve.wasm'), new Uint8Array([0,97,115,109,1,0,0,0]));
  await writeFile(path.join(input, 'eve.data'), 'fixture assets');
}
test('probe is self-contained, small and validates relative paths', async t => {
  const { output } = await fixture(t);
  assert.equal((await exportProbe(output)).ok, true);
  assert.match(await readFile(path.join(output, 'index.html'), 'utf8'), /EVEngine/);
  await assert.rejects(exportProbe(output), /EEXIST/);
});
test('pack selects runtime files, renames entry and retains source artifacts unchanged', async t => {
  const { input, output } = await fixture(t);
  await runtime(input);
  await writeFile(path.join(input, 'cmake_install.cmake'), 'not a game asset');
  const report = await exportPackage(input, output);
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some(item => item.includes('Thread')));
  const names = await readdir(output);
  assert.ok(names.includes('index.html')); assert.ok(!names.includes('eve.html'));
  assert.ok(!names.includes('cmake_install.cmake'));
  assert.ok((await readdir(input)).includes('eve.html'));
  await assert.rejects(exportPackage(input, output), /already exists/);
});
test('failed packaging publishes no partial output', async t => {
  const { input, output, parent } = await fixture(t);
  await runtime(input);
  await writeFile(path.join(input, 'eve.html'), '<script src="/eve.js"></script>');
  await assert.rejects(exportPackage(input, output), /Toy shell/);
  assert.deepEqual((await readdir(parent)).sort(), ['input']);
});
test('doctor blocks root URLs, missing resources, filtered files and oversized entry', async t => {
  const { input } = await fixture(t);
  await writeFile(path.join(input, 'index.html'), '<script src="/app.js"></script><img src="./missing.png">');
  await writeFile(path.join(input, 'app.mjs'), 'export{}');
  let report = await doctor(input);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some(item => item.includes('Root-absolute')));
  assert.ok(report.errors.some(item => item.includes('Missing resource')));
  assert.ok(report.errors.some(item => item.includes('unsupported file')));
  await writeFile(path.join(input, 'index.html'), 'x'.repeat(1024*1024+1));
  report = await doctor(input);
  assert.ok(report.errors.some(item => item.includes('1 MiB')));
});
test('overlapping paths are rejected in both directions', () => {
  for (const [a,b] of [['a','a'], ['a','a/b'], ['a/b','a']]) assert.throws(() => disjoint(a,b));
  assert.doesNotThrow(() => disjoint('a','b'));
});

test('pack creates missing output parents without overwriting existing artifacts', async t => {
  const { input, parent } = await fixture(t);
  await runtime(input);
  const output = path.join(parent, 'dist', 'nested', 'game');
  assert.equal((await exportPackage(input, output)).ok, true);
  assert.ok((await readdir(output)).includes('index.html'));
  await assert.rejects(exportPackage(input, output), /already exists/);
});
