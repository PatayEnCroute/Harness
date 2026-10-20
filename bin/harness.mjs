#!/usr/bin/env node
// Installe le harness en une commande : npx github:PatayEnCroute/Harness
// Vérifie git, installe uv au besoin (avec accord), lance Copier puis ouvre Claude Code sur /hx-setup.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COPIER_VERSION = '9.19.1';
const TEMPLATE = 'gh:PatayEnCroute/Harness';
const WIN = process.platform === 'win32';
const UV_INSTALL = WIN
  ? ['powershell', ['-ExecutionPolicy', 'ByPass', '-c', 'irm https://astral.sh/uv/install.ps1 | iex']]
  : ['sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh']];

const HELP = `npx github:PatayEnCroute/Harness [options] [options de copier]

  Installe le harness dans le dossier courant (projet nouveau ou existant), puis ouvre Claude Code sur /hx-setup.

  --template <source>  template à installer (défaut : ${TEMPLATE}, dernier tag)
  --no-claude          ne pas ouvrir Claude Code à la fin
  -h, --help           cette aide

  Les autres options vont à copier, par exemple --vcs-ref vX.Y.Z ou --defaults.
  Sans terminal (agent, CI) : --defaults obligatoire, réponses en --data clé=valeur (voir INSTALL.md).`;

export function parseArgs(argv) {
  const opts = { template: TEMPLATE, claude: true, help: false, copier: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--template') opts.template = argv[++i];
    else if (a === '--no-claude') opts.claude = false;
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts.copier.push(a);
  }
  return opts;
}

const run = (cmd, args, cwd, extra = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', ...extra });
const found = (cmd, args = ['--version'], extra = {}) => run(cmd, args, process.cwd(), extra).status === 0;

// Ce qu'il faut faire du dépôt git avant d'installer : rien, `git init` (dossier vide), ou refuser.
// Un arbre propre garantit que /hx-setup retrouve dans git les fichiers remplacés par l'installation.
export function preflight(cwd) {
  if (!found('git')) return { error: 'git est requis : https://git-scm.com/downloads' };
  if (fs.existsSync(path.join(cwd, '.copier-answers.yml'))) {
    return { error: `un template Copier est déjà installé ici (.copier-answers.yml). Si c'est le harness, mets-le à jour : uvx copier@${COPIER_VERSION} update --trust` };
  }
  if (run('git', ['rev-parse', '--is-inside-work-tree'], cwd).status !== 0) {
    if (fs.readdirSync(cwd).length === 0) return { init: true };
    return { error: 'ce dossier n\'est pas un dépôt git. Versionne-le d\'abord : git init && git add -A && git commit -m "avant harness"' };
  }
  if (run('git', ['status', '--porcelain'], cwd).stdout.trim()) {
    return { error: 'des changements ne sont pas commités. Commite-les d\'abord : /hx-setup récupère dans git ce que l\'installation remplace.' };
  }
  return {};
}

// uvx sur le PATH, ou là où l'installeur officiel le pose (le PATH du processus n'est pas encore à jour).
export function findUvx(home = os.homedir()) {
  if (found('uvx')) return 'uvx';
  const exe = WIN ? 'uvx.exe' : 'uvx';
  return [path.join(home, '.local', 'bin', exe), path.join(home, '.cargo', 'bin', exe)].find((p) => fs.existsSync(p)) ?? null;
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [O/n] `)).trim().toLowerCase();
  rl.close();
  return answer === '' || answer === 'o' || answer === 'oui' || answer === 'y';
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) return console.log(HELP), 0;
  const cwd = process.cwd();
  const fail = (msg) => (console.error(`harness : ${msg}`), 1);

  // Sans terminal (agent, CI), Copier ne peut pas poser ses questions : réponses par --defaults et --data (INSTALL.md).
  if (!process.stdin.isTTY && !opts.copier.some((a) => a === '--defaults' || a === '-l')) {
    return fail('sans terminal interactif, passe --defaults et les réponses en --data clé=valeur (voir INSTALL.md)');
  }
  const pre = preflight(cwd);
  if (pre.error) return fail(pre.error);
  if (pre.init) {
    console.log('Dossier vide : git init.');
    run('git', ['init', '-q'], cwd);
  }

  let uvx = findUvx();
  if (!uvx) {
    const [cmd, args] = UV_INSTALL;
    if (!(await confirm('uv (requis pour lancer Copier) est absent. L\'installer maintenant ?'))) {
      return fail(`uv est requis. Installe-le avec : ${cmd} ${args.join(' ')}`);
    }
    if (run(cmd, args, cwd, { stdio: 'inherit' }).status !== 0 || !(uvx = findUvx())) return fail('installation de uv en échec');
  }

  const copier = run(uvx, [`copier@${COPIER_VERSION}`, 'copy', '--trust', ...opts.copier, opts.template, '.'], cwd, { stdio: 'inherit' });
  if (copier.status !== 0) return fail('copier a échoué');

  if (opts.claude && process.stdin.isTTY && found('claude', ['--version'], { shell: WIN })) {
    console.log('\nOuverture de Claude Code sur /hx-setup…');
    return run('claude', ['/hx-setup'], cwd, { stdio: 'inherit', shell: WIN }).status ?? 1;
  }
  console.log('\nÉtape suivante : ouvre Claude Code dans ce dossier et lance /hx-setup.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
