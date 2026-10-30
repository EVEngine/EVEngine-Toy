import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, lstat, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, files, disjoint, exportPackage } from './package.mjs';

export function configureArguments(options, webGame) {
  return ['-S', options.engine, '-B', path.join(options.build, 'runtime'), '-G', 'Ninja',
    '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_TESTING=OFF', '-DEVENGINE_BUILD_PLATFORM=webgpu',
    '-DEVENGINE_MODULE_font=ON',
    '-DEVENGINE_COMPILER_CACHE=OFF', '-DEVENGINE_THIRD_PARTY_MODE=SOURCE',
    `-DEVE_TOY_ENABLE_THREADS=${options.threads === 'true' ? 'ON' : 'OFF'}`,
    `-DEVENGINE_WEB_CMAKE=${options.cmake}`, `-DEVENGINE_PROFILE=${options.profile ?? 'minimal'}`,
    `-DCMAKE_PROJECT_INCLUDE=${path.join(root, 'cmake/AttachToEngine.cmake')}`,
    `-DEVENGINE_WEBGPU_GAME_DIR=${webGame}`];
}
function execute(command, args) {
  console.error(`[eve-toy] ${command} ${args.map(value=>JSON.stringify(value)).join(' ')}`);
  const child = spawnSync(command, args, { stdio:'inherit', shell:false });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${command} failed with exit ${child.status}`);
}
export async function buildGame(options, run = execute) {
  for (const field of ['game','engine','emsdk','build','output','cmake']) {
    if (!options[field]) throw new Error(`Missing --${field}`);
    options[field] = path.resolve(options[field]);
  }
  if (options.threads !== undefined && !['true','false'].includes(options.threads)) throw new Error('--threads must be true or false');
  if (options.profile !== undefined && !['minimal','web'].includes(options.profile)) throw new Error('--profile must be minimal or web');
  const jobs = Number(options.jobs ?? 4);
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 64) throw new Error('--jobs must be 1..64');
  disjoint(options.game, options.build);
  disjoint(options.game, options.output);
  disjoint(options.build, options.output);
  for (const name of ['config.nut','main.nut'])
    if (!(await lstat(path.join(options.game,name))).isFile()) throw new Error(`Missing game ${name}`);
  if (!(await lstat(path.join(options.engine,'CMakeLists.txt'))).isFile()) throw new Error('Invalid EVEngine source tree');
  try { await lstat(options.output); throw new Error('Output already exists; choose a new directory'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const eve = options.eve ?? 'eve';
  run(eve, ['-v']);
  await mkdir(options.build, { recursive:true });
  const lock = path.join(options.build,'.export-lock');
  try { await mkdir(lock); }
  catch(error) { if(error.code==='EEXIST') throw new Error('Build directory is locked by another export; inspect .export-lock/owner.json before recovering an interrupted build'); throw error; }
  try {
  await writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,game:options.game,output:options.output}), 'utf8');
  const snapshot = await mkdtemp(path.join(options.build,'game-source-'));
  const game = path.join(snapshot,'game');
  await mkdir(game);
  for (const name of await files(options.game)) {
    if (name.split(path.sep).some(part=>part.startsWith('.')||part==='node_modules')) continue;
    const target = path.join(game,name);
    await mkdir(path.dirname(target),{recursive:true});
    await copyFile(path.join(options.game,name),target);
  }
  // The actual engine CLI is the sole game-archive producer.
  run(eve, ['zip', game]);
  const archive = `${game}.eve`;
  const archiveBytes = await readFile(archive);
  const webGame = path.join(options.build,'web-game');
  await mkdir(webGame,{recursive:true});
  await writeFile(path.join(webGame,'game.eve'),archiveBytes);
  // The engine's standard /game entry detects game.eve and mounts it through PhysFS.
  // Do not reimplement the archive format or rewrite packaged scripts.
  const emcmake = path.join(options.emsdk,'upstream/emscripten/emcmake.py');
  await lstat(emcmake);
  const python = options.python ?? 'python3';
  run(python,[emcmake, options.cmake, ...configureArguments(options,webGame)]);
  const runtimeBuild = path.join(options.build,'runtime');
  run(options.cmake,['--build',runtimeBuild,'--target','deps','--parallel',String(jobs)]);
  run(options.cmake,['--build',runtimeBuild,'--target','eve','--parallel',String(jobs)]);
  const check = await exportPackage(path.join(runtimeBuild,'src/engine'),options.output);
  const receipt = { schema:'evengine.toy.build',version:1,game:options.game,
    engine:options.engine,archiveSha256:createHash('sha256').update(archiveBytes).digest('hex'),
    archiveBytes:archiveBytes.length,output:options.output,check };
  await writeFile(path.join(options.build,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n','utf8');
  return receipt;
  } finally { await rm(lock,{recursive:true,force:true}); }
}
export function parseBuildOptions(args) {
  const result = {};
  const allowed = new Set(['game','engine','emsdk','build','output','cmake','python','eve','jobs','threads','profile']);
  for(let i=0;i<args.length;i++) {
    const [flag,...inline]=args[i].split('=');
    const name=flag.startsWith('--')?flag.slice(2):'';
    if(!allowed.has(name)||Object.hasOwn(result,name)) throw new Error(`Invalid or duplicate build option: ${flag}`);
    const value=inline.length?inline.join('='):args[++i];
    if(!value||value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    result[name]=value;
  }
  return result;
}
