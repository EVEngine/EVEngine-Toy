import test from 'node:test';
import assert from 'node:assert/strict';
import { configureArguments, parseBuildOptions } from '../lib/build.mjs';

test('build has explicit validated tool paths and arguments without a shell',()=>{
  const options=parseBuildOptions(['--game','my game','--engine=engine','--jobs=4']);
  assert.equal(options.game,'my game'); assert.equal(options.jobs,'4');
  for(const args of [['--unknown=x'],['--game'],['--jobs=4','--jobs=8']]) assert.throws(()=>parseBuildOptions(args));
});
test('browser build uses real engine, external plugin and game archive mount',()=>{
  const args=configureArguments({engine:'engine',build:'build',cmake:'cmake'},'web-game');
  assert.ok(args.includes('-DEVENGINE_BUILD_PLATFORM=webgpu'));
  assert.ok(args.includes('-DEVENGINE_WEBGPU_GAME_DIR=web-game'));
  assert.ok(args.some(arg=>arg.startsWith('-DCMAKE_PROJECT_INCLUDE=')&&arg.includes('AttachToEngine.cmake')));
  assert.ok(args.includes('-DEVENGINE_PROFILE=minimal'));
  assert.ok(configureArguments({engine:'engine',build:'build',cmake:'cmake',profile:'web'},'game').includes('-DEVENGINE_PROFILE=web'));
});

test('thread mode is explicit and disabled by default for Toy hosting',()=>{
  const base={engine:'engine',build:'build',cmake:'cmake'};
  assert.ok(configureArguments(base,'game').includes('-DEVE_TOY_ENABLE_THREADS=OFF'));
  assert.ok(configureArguments({...base,threads:'true'},'game').includes('-DEVE_TOY_ENABLE_THREADS=ON'));
});

test('an occupied build lock cannot be reused and failed archiving releases its own lock', async t=>{
  const {mkdtemp,mkdir,writeFile,readdir,rm}=await import('node:fs/promises');
  const path=await import('node:path');
  const os=await import('node:os');
  const {buildGame}=await import('../lib/build.mjs');
  const root=await mkdtemp(path.join(os.tmpdir(),'eve-toy-build-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const name of ['game','engine','emsdk','build']) await mkdir(path.join(root,name));
  await writeFile(path.join(root,'game/config.nut'),'config = {};');
  await writeFile(path.join(root,'game/main.nut'),'// input');
  await writeFile(path.join(root,'engine/CMakeLists.txt'),'# configure is never reached');
  const options={game:path.join(root,'game'),engine:path.join(root,'engine'),emsdk:path.join(root,'emsdk'),
    build:path.join(root,'build'),output:path.join(root,'output'),cmake:'cmake'};
  const lock=path.join(options.build,'.export-lock');
  await mkdir(lock);
  const calls=[];
  await assert.rejects(buildGame({...options},(tool,args)=>calls.push(args)),/locked/);
  assert.equal(calls.length,1); assert.equal(calls[0][0],'-v');
  await rm(lock,{recursive:true});
  await assert.rejects(buildGame({...options},(tool,args)=>{if(args[0]==='zip') throw new Error('archive rejected');}),/archive rejected/);
  assert.ok(!(await readdir(options.build)).includes('.export-lock'));
  assert.ok(!(await readdir(root)).includes('output'));
});
