#!/usr/bin/env node
// Hooks Claude Code du harness, câblés dans .claude/settings.json.
// Fichier géré par le template Harness : les améliorations se font dans Harness, puis `copier update`.
// Un hook ne doit jamais casser une session : une erreur inattendue est signalée puis ignorée.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  FAST_STEPS,
  execute,
  findComponentForFile,
  installedOpenspecVersion,
  listChanges,
  loadValidConfig,
  readChangeMeta,
  readText,
  readVersions,
  resolveInvocations,
  tail,
  taskProgress,
} from './hx.mjs';

const FEEDBACK = 2; // code de sortie qui renvoie stderr à Claude
const NOT_CODE = /^(\.harness|\.claude|\.github|openspec|docs)\/|\.md$/;
const CASE_INSENSITIVE_FS = process.platform === 'darwin' || process.platform === 'win32';

// Chemin réel : résout les liens symboliques du plus proche parent existant (le fichier peut ne pas exister encore).
function realPath(file) {
  const abs = path.resolve(file);
  const parent = path.dirname(abs);
  try {
    return fs.realpathSync(abs);
  } catch {
    return parent === abs ? abs : path.join(realPath(parent), path.basename(abs));
  }
}

// Chemin relatif à la racine, en « / », liens résolus ; commence par « ../ » hors du projet.
export function relative(root, file) {
  return path.relative(realPath(root), realPath(path.resolve(root, file))).split(path.sep).join('/');
}

// Fichiers qui décident de ce qui s'exécute sans confirmation (commandes du contrat, hooks, permissions),
// et specs principales, qui ne changent que par /opsx:sync ou /opsx:archive.
const PROTECTED = [
  { test: (rel) => rel.startsWith('openspec/specs/'), reason: 'openspec/specs/ ne change que pendant /opsx:sync ou /opsx:archive. Confirme seulement dans ce cadre.' },
  {
    test: (rel) => ['.harness/config.json', '.harness/hx.mjs', '.harness/hooks.mjs'].includes(rel) || /^\.claude\/settings(\.local)?\.json$/.test(rel),
    reason: 'Ce fichier décide des commandes exécutées sans confirmation (contrat hx, hooks ou permissions). Vérifie la modification avant de l\'accepter.',
  },
];
const PROTECTED_IN_COMMAND = /(?:^|[\s'"=/])(\.harness\/(?:config\.json|hx\.mjs|hooks\.mjs)|\.claude\/settings(?:\.local)?\.json|openspec\/specs\/)/;
// Écritures probables dans une commande shell (redirections vers /dev/null ou entre descripteurs exclues).
const WRITES = /\btee\b|\b(sed|perl)\b[^|;&]*\s-\w*i|--in-place|\b(mv|cp|rm|truncate|dd|ln)\s|writeFile|\bopen\(|>/;
const writes = (command) => WRITES.test(command.replace(/\d*>&\d|\d*>\s*\/dev\/null/g, ''));

// État de la session : fichiers édités par Claude, lus par le hook Stop. Hors du dépôt, une entrée par projet et session.
function sessionFile(root, input) {
  const key = createHash('sha256').update(`${realPath(root)}\0${input.session_id ?? 'sans-session'}`).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'hx-hooks', `${key}.json`);
}

function readEdited(root, input) {
  try {
    return JSON.parse(fs.readFileSync(sessionFile(root, input), 'utf8'));
  } catch {
    return [];
  }
}

function writeEdited(root, input, files) {
  const file = sessionFile(root, input);
  if (!files.length) return fs.rmSync(file, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(files));
}

// Contrat utilisable par les hooks : null si absent ou pas encore personnalisé (aucun composant).
// Un contrat illisible ou cassé n'est jamais ignoré en silence : il revient à Claude comme retour bloquant.
function hookConfig(root) {
  const { config, errors } = loadValidConfig(root, { structural: true });
  if (errors.length) {
    console.error(`Contrat .harness/config.json invalide : les contrôles du harness sont désactivés tant qu'il n'est pas corrigé.\n${errors.map((e) => `- ${e}`).join('\n')}`);
    return { config: null, code: FEEDBACK };
  }
  if (!config || !Object.keys(config.components ?? {}).length) return { config: null, code: 0 };
  return { config, code: 0 };
}

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

// Contexte injecté au démarrage : projet à personnaliser, changes en cours, CLI openspec en session cloud.
export function sessionStart(root, input, env = process.env) {
  const lines = [];
  if (readText(path.join(root, '.harness', 'project.md')).includes('hx:todo')) {
    lines.push("- Harness pas encore personnalisé : propose à l'utilisateur de lancer /hx-setup.");
  }
  const pinned = readVersions(root).openspec;
  if (env.CLAUDE_CODE_REMOTE === 'true' && /^[\w.-]+$/.test(pinned ?? '') && installedOpenspecVersion() !== pinned) {
    const r = spawnSync('npm', ['i', '-g', `@fission-ai/openspec@${pinned}`], { stdio: 'ignore', shell: process.platform === 'win32' });
    lines.push(r.status === 0
      ? `- CLI openspec ${pinned} installée pour cette session.`
      : `- Échec de l'installation de la CLI openspec ${pinned} : les commandes /opsx:* ne fonctionneront pas.`);
  }
  for (const change of listChanges(root)) {
    const { done, total } = taskProgress(change.dir);
    const track = readChangeMeta(change.dir)['x-track'] ?? '?';
    lines.push(`- Change OpenSpec en cours : ${change.name} (piste ${track}, ${done}/${total} tâches)`);
  }
  if (lines.length) console.log(`Harness :\n${lines.join('\n')}`);
  return 0;
}

// Skills installés par OpenSpec qui court-circuitent le workflow du harness (réécrits par `openspec update` : on ne les modifie pas).
const REDIRECTED_SKILLS = {
  'openspec-apply-change': 'Le harness implémente un change avec hx-implement (sous-agent neuf par tâche, revue de conformité, preuve). Confirme seulement si l\'utilisateur a demandé openspec-apply-change explicitement.',
};

// Fichiers protégés : confirmation demandée, qu'ils soient édités par Edit/Write ou par une commande Bash qui écrit.
// Skills qui court-circuitent le workflow : confirmation aussi, avec l'alternative.
export function preToolUse(root, input) {
  let reason;
  if (input.tool_name === 'Skill') {
    const skill = String(input.tool_input?.skill ?? '').replace(/^.*:/, '');
    reason = Object.hasOwn(REDIRECTED_SKILLS, skill) ? REDIRECTED_SKILLS[skill] : undefined;
  } else if (input.tool_name === 'Bash') {
    const command = String(input.tool_input?.command ?? '');
    const target = PROTECTED_IN_COMMAND.exec(command);
    if (target && writes(command)) {
      reason = PROTECTED.find((p) => p.test(target[1]))?.reason;
    }
  } else {
    const file = input.tool_input?.file_path;
    const rel = file && relative(root, file);
    if (rel) reason = PROTECTED.find((p) => p.test(CASE_INSENSITIVE_FS ? rel.toLowerCase() : rel))?.reason;
  }
  if (!reason) return 0;
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
  return 0;
}

// Lint du fichier modifié, seulement si le composant définit « lint-file » (retour rapide).
// Le fichier est aussi noté pour le hook Stop.
export function postToolUse(root, input) {
  const file = input.tool_input?.file_path;
  if (!file) return 0;
  const rel = relative(root, file);
  if (!rel.startsWith('../') && !NOT_CODE.test(rel)) {
    const edited = readEdited(root, input);
    if (!edited.includes(rel)) writeEdited(root, input, [...edited, rel]);
  }
  const { config, code } = hookConfig(root);
  if (!config || NOT_CODE.test(rel)) return code;
  const failures = [];
  for (const inv of resolveInvocations(config, root, 'lint', { file: path.join(root, rel), fileOnly: true })) {
    const r = execute(inv.command, inv.cwd, { capture: true });
    if (!r.ok) failures.push(`lint · ${inv.component} : ${inv.command}\n${tail(r.output, 30)}`);
  }
  if (!failures.length) return 0;
  console.error(failures.join('\n\n'));
  return FEEDBACK;
}

// Avant de rendre la main : lint + typecheck des seuls composants dont Claude a édité du code pendant la session.
// Les modifications antérieures ou faites hors de Claude ne déclenchent rien ; la liste est vidée une fois au vert.
export function stop(root, input) {
  if (input.stop_hook_active) return 0;
  const { config, code } = hookConfig(root);
  if (!config) return code;
  const edited = readEdited(root, input);
  const touched = new Set(edited
    .map((rel) => findComponentForFile(config, root, path.join(root, rel))?.component.name)
    .filter(Boolean));
  const failures = [];
  for (const component of touched) {
    for (const step of FAST_STEPS) {
      for (const inv of resolveInvocations(config, root, step, { component })) {
        const r = execute(inv.command, inv.cwd, { capture: true });
        if (!r.ok) failures.push(`${step} · ${inv.component} : ${inv.command}\n${tail(r.output, 30)}`);
      }
    }
  }
  if (!failures.length) {
    writeEdited(root, input, []);
    return 0;
  }
  console.error(`Le code modifié ne passe pas les contrôles rapides. Corrige avant de terminer, ou explique pourquoi c'est attendu.\n\n${failures.join('\n\n')}`);
  return FEEDBACK;
}

const HANDLERS = { 'session-start': sessionStart, 'pre-tool-use': preToolUse, 'post-tool-use': postToolUse, stop };

export function runHook(event, root, input) {
  const handler = HANDLERS[event];
  if (!handler) {
    console.error(`hooks : événement inconnu « ${event} »`);
    return 0;
  }
  try {
    return handler(root, input);
  } catch (err) {
    console.error(`hooks : ${event} a échoué (${err.message}), ignoré`);
    return 0;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const root = process.env.CLAUDE_PROJECT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  process.exitCode = runHook(process.argv[2], root, readInput());
}
