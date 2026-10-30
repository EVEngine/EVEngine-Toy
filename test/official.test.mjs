import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { previewArguments, preview } from '../lib/official.mjs';
import { exportProbe } from '../lib/package.mjs';
const help = { commands:[{ path:['create'], flags:[{ name:'title', type:'string' },
  { name:'visibility', type:'string', choices:['public','link-only'] }, {name:'yes',type:'bool'}] }] };

test('preview derives metadata flags from installed CLI, fixes JSON and never submits', () => {
  const args = previewArguments(help, 'game', ['--title','A game','--visibility=link-only']);
  assert.deepEqual(args, ['create','game','--json','--title=A game','--visibility=link-only']);
  for (const flags of [['--yes'],['--yes=true'],['--json=false'],['--unknown=x'],['--title'],['--visibility=invalid']])
    assert.throws(() => previewArguments(help, 'game', flags));
  assert.throws(() => previewArguments({}, 'game'));
});
test('preview prechecks package and executes only help then create without yes', async t => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'eve-toy-preview-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const directory = path.join(parent, 'probe'); await exportProbe(directory);
  const calls = [];
  const result = await preview(directory, ['--title=Probe'], args => {
    calls.push(args); return calls.length === 1 ? help : { preview_url:'https://example.invalid/preview' };
  });
  assert.equal(result.submitted, false);
  assert.equal(calls.length, 2);
  assert.ok(!calls[1].some(value=>value.startsWith('--yes')));
  assert.ok(result.check.warnings.length);
});
