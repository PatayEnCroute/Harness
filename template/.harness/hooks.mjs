#!/usr/bin/env node
// Hooks Claude Code du harness, câblés dans .claude/settings.json.
// Fichier géré par le template Harness : les améliorations se font dans Harness, puis `copier update`.
// Un hook ne doit jamais casser une session : une erreur inattendue est signalée puis ignorée.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  FAST_STEPS,
  execute,
  findComponentForFile,
  installedOpenspecVersion,
  listChanges,
  loadConfig,
  readChangeMeta,
  readText,
  readVersions,
  resolveInvocations,
  tail,
  taskProgress,
} from './hx.mjs';

const FEEDBACK = 2; // code de sortie qui renvoie stderr à Claude
const NOT_CODE = /^(\.harness|\.claude|\.github|openspec|docs)\/|\.md$/;

const relative = (root, file) => path.relative(root, path.resolve(root, file)).split(path.sep).join('/');

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
  if (env.CLAUDE_CODE_REMOTE === 'true' && pinned && installedOpenspecVersion() !== pinned) {
    const r = spawnSync(`npm i -g @fission-ai/openspec@${pinned}`, { shell: true, stdio: 'ignore' });
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

// Les specs principales ne changent que par /opsx:sync ou /opsx:archive : on demande confirmation.
export function preToolUse(root, input) {
  const file = input.tool_input?.file_path;
  if (!file || !relative(root, file).startsWith('openspec/specs/')) return 0;
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: 'openspec/specs/ ne change que pendant /opsx:sync ou /opsx:archive. Confirme seulement dans ce cadre.',
    },
  }));
  return 0;
}

// Lint du fichier modifié, seulement si le composant définit « lint-file » (retour rapide).
export function postToolUse(root, input) {
  const file = input.tool_input?.file_path;
  const { config } = loadConfig(root);
  if (!file || !config) return 0;
  const failures = [];
  for (const inv of resolveInvocations(config, root, 'lint', { file: path.resolve(root, file), fileOnly: true })) {
    const r = execute(inv.command, inv.cwd, { capture: true });
    if (!r.ok) failures.push(`lint · ${inv.component} : ${inv.command}\n${tail(r.output, 30)}`);
  }
  if (!failures.length) return 0;
  console.error(failures.join('\n\n'));
  return FEEDBACK;
}

// Fichiers modifiés, relatifs à la racine du projet (qui peut être un sous-dossier du dépôt git).
function changedFiles(root) {
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const top = git(['rev-parse', '--show-toplevel']);
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  if (top.status !== 0 || status.status !== 0) return [];
  return status.stdout.split('\n').filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
    .map((file) => relative(root, path.join(top.stdout.trim(), file)))
    .filter((file) => !file.startsWith('../'));
}

// Avant de rendre la main : si du code a changé, lint + typecheck doivent passer.
export function stop(root, input) {
  if (input.stop_hook_active) return 0;
  const { config } = loadConfig(root);
  if (!config) return 0;
  const touched = changedFiles(root).filter((f) => !NOT_CODE.test(f) && findComponentForFile(config, root, path.join(root, f)));
  if (!touched.length) return 0;
  const failures = [];
  for (const step of FAST_STEPS) {
    for (const inv of resolveInvocations(config, root, step)) {
      const r = execute(inv.command, inv.cwd, { capture: true });
      if (!r.ok) failures.push(`${step} · ${inv.component} : ${inv.command}\n${tail(r.output, 30)}`);
    }
  }
  if (!failures.length) return 0;
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
