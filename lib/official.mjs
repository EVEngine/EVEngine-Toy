import { spawnSync } from 'node:child_process';
import { doctor } from './package.mjs';

function runToy(args) {
  const result = spawnSync('toy', args, { encoding: 'utf8', shell: false, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new Error(`Official toy CLI unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `toy exited ${result.status}`);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('Official toy CLI did not return JSON'); }
}
export function previewArguments(help, directory, metadata = []) {
  const commands = [];
  function visit(node) {
    for (const command of node.commands ?? []) { commands.push(command); visit(command); }
  }
  visit(help);
  const command = commands.find(item => Array.isArray(item.path) && item.path.join(' ') === 'create');
  if (!command) throw new Error('Current toy --help-json does not describe create; update the CLI or inspect its help');
  const flags = new Map((command.flags ?? []).map(flag => [flag.name?.replace(/^--/, ''), flag]));
  const args = ['create', directory, '--json'];
  for (let index = 0; index < metadata.length; index++) {
    const text = metadata[index];
    if (!text.startsWith('--')) throw new Error(`Expected a metadata flag: ${text}`);
    const split = text.indexOf('=');
    const name = text.slice(2, split < 0 ? undefined : split);
    if (['yes', 'json', 'help', 'help-json'].includes(name)) throw new Error(`Flag --${name} is controlled by preview`);
    const definition = flags.get(name);
    if (!definition) throw new Error(`Flag --${name} is absent from the installed CLI create help`);
    let value = split < 0 ? undefined : text.slice(split + 1);
    if (definition.type === 'bool' || definition.type === 'boolean') {
      value ??= 'true';
      if (!['true', 'false'].includes(value)) throw new Error(`Flag --${name} requires a boolean`);
    } else {
      value ??= metadata[++index];
      if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    }
    if (definition.choices?.length && !definition.choices.includes(value)) throw new Error(`Invalid choice for --${name}`);
    args.push(`--${name}=${value}`);
  }
  return args;
}
export async function preview(directory, metadata = [], run = runToy) {
  const check = await doctor(directory);
  if (!check.ok) throw new Error(`Package check failed: ${check.errors.join('; ')}`);
  const help = run(['--help-json']);
  const args = previewArguments(help, directory, metadata);
  return { check, preview: run(args), submitted: false };
}
