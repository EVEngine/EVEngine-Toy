import { lstat, readdir, readFile, mkdir, copyFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
// Official publishing guide, checked 2026-10-29. No arbitrary extension renaming.
const allowed = new Set('html htm css js json wasm data md csv tsv png jpg jpeg gif svg webp ico woff2 woff ttf eot mp3 wav ogg m4a mp4 webm atlas ani part nani unityweb'.split(' '));
export async function files(directory, prefix = '') {
  const output = [];
  for (const name of await readdir(directory)) {
    const relative = path.join(prefix, name);
    const full = path.join(directory, name);
    const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error(`Symbolic links are not packaged: ${relative}`);
    if (info.isDirectory()) output.push(...await files(full, relative));
    else if (info.isFile()) output.push(relative);
    else throw new Error(`Unsupported filesystem entry: ${relative}`);
  }
  return output.sort();
}
export async function doctor(directory, entry = 'index.html') {
  const errors = [], warnings = [];
  const names = await files(directory);
  if (!names.includes(entry)) errors.push(`Missing ${entry} at package root`);
  let bytes = 0;
  for (const name of names) {
    const info = await lstat(path.join(directory, name));
    bytes += info.size;
    const extension = path.extname(name).slice(1).toLowerCase();
    if (name.split(path.sep).some(part => part.startsWith('.') || part === 'node_modules') ||
        path.basename(name) === 'package.json') errors.push(`Source/private file in package: ${name}`);
    if (!allowed.has(extension)) errors.push(`Toy may filter this unsupported file: ${name}`);
    if (name === entry && info.size > 1024 * 1024) errors.push('Entry HTML exceeds the documented 1 MiB limit');
    if (['html', 'htm', 'js', 'css'].includes(extension)) {
      const content = await readFile(path.join(directory, name), 'utf8');
      if (extension === 'html' || extension === 'htm') {
        if (/(?:src|href|poster)\s*=\s*["']\/(?!\/)/i.test(content) ||
            /<base\b[^>]*href\s*=\s*["']\//i.test(content)) errors.push(`Root-absolute URL in ${name}`);
        for (const match of content.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
          const url = match[1];
          if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i.test(url)) continue;
          const target = path.resolve(directory, path.dirname(name), decodeURIComponent(url.split(/[?#]/)[0]));
          const rel = path.relative(path.resolve(directory), target);
          if (rel.startsWith('..') || path.isAbsolute(rel)) { errors.push(`Resource escapes package in ${name}: ${url}`); continue; }
          if (url.split(/[?#]/)[0] && !names.includes(rel)) errors.push(`Missing resource in ${name}: ${url}`);
        }
      }
      if (extension === 'css' && /url\(\s*["']?\/(?!\/)/i.test(content)) errors.push(`Root-absolute CSS URL in ${name}`);
      if (extension === 'js' && /(?:fetch|importScripts)\(\s*["']\/(?!\/)/.test(content)) errors.push(`Root-absolute runtime URL in ${name}`);
      if (/SharedArrayBuffer|PTHREAD_POOL_SIZE|pthread|shared\s*:\s*(?:true|!0)/.test(content))
        warnings.push(`Thread dependency in ${name}: actual Toy hosting must provide isolation/SharedArrayBuffer`);
    }
  }
  warnings.push('Static checks cannot establish WebGPU, response headers, iframe permissions or App WebView compatibility. Run probe.html on Toy.');
  return { schema: 'evengine.toy.package-check', version: 1, ok: errors.length === 0,
    files: names.length, bytes, errors, warnings: [...new Set(warnings)] };
}
export function disjoint(input, output) {
  const a = path.resolve(input), b = path.resolve(output);
  const contains = (x, y) => { const rel = path.relative(x, y); return !rel || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
  if (contains(a, b) || contains(b, a)) throw new Error('Input and output must be separate, non-nested directories');
}
export async function exportPackage(input, output) {
  disjoint(input, output);
  try { await lstat(output); throw new Error('Output already exists; choose a new directory'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // src/engine/ is a CMake build directory. Only Emscripten outputs belong in
  // the upload; assets are already embedded in eve.data by EVEngine.
  const names = (await readdir(input)).filter(name =>
    /^(?:eve(?:[.-][A-Za-z0-9_-]+)*\.(?:html|js|wasm|data)|index\.html)$/.test(name));
  for (const name of names) {
    const info = await lstat(path.join(input, name));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Runtime artifact must be a regular file: ${name}`);
  }
  for (const required of ['eve.js', 'eve.wasm', 'eve.data'])
    if (!names.includes(required)) throw new Error(`Missing EVEngine runtime artifact: ${required}`);
  const entry = names.includes('eve.html') ? 'eve.html' : 'index.html';
  if (!names.includes(entry)) throw new Error('Expected EVEngine eve.html or index.html');
  if (entry !== 'index.html' && names.includes('index.html')) throw new Error('Ambiguous HTML entries');
  const staging = `${path.resolve(output)}.staging-${process.pid}`;
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await mkdir(staging); // Exclusive: never delete a pre-existing staging directory.
  try {
    for (const name of names) {
      const target = path.join(staging, name === entry ? 'index.html' : name);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(input, name), target);
    }
    for (const [source, target] of [['probe.js','toy-probe.js'], ['boot.js','toy-boot.js'],
      ['toy.css','toy.css'], ['probe.html','probe.html'], ['probe-page.js','probe-page.js']]) {
      if (names.includes(target)) throw new Error(`Reserved plugin asset already exists: ${target}`);
      await copyFile(path.join(root, 'web', source), path.join(staging, target));
    }
    const entryText = await readFile(path.join(staging, 'index.html'), 'utf8');
    if (!entryText.includes('engine-entry') || !entryText.includes('toy-boot.js'))
      throw new Error('Build does not use the Toy shell. Rebuild with cmake/AttachToEngine.cmake');
    const runtime = await readFile(path.join(staging, 'eve.js'), 'utf8');
    if (!runtime.includes('EVEToyBridge')) throw new Error('Runtime does not contain the Toy bridge; rebuild with AttachToEngine.cmake');
    const report = await doctor(staging);
    if (!report.ok) throw new Error(`Package check failed:\n${report.errors.join('\n')}`);
    await rename(staging, output);
    return report;
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}
export async function exportProbe(output) {
  await mkdir(output); // Refuse existing output.
  for (const [source, target] of [['probe.js','toy-probe.js'], ['probe.html','index.html'],
    ['probe-page.js','probe-page.js'], ['toy.css','toy.css']])
    await copyFile(path.join(root, 'web', source), path.join(output, target));
  return doctor(output);
}
