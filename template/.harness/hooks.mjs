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
  pinnedOpenspec,
  readChangeMeta,
  readText,
  readVersions,
  reportVerdict,
  resolveInvocations,
  tail,
  taskProgress,
  worktreeStatus,
} from './hx.mjs';

const FEEDBACK = 2; // code de sortie qui renvoie stderr à Claude
// Budgets sous les délais de .claude/settings.json (PostToolUse 120 s, Stop 600 s) : une commande trop lente
// est arrêtée et signalée, au lieu que Claude Code tue le hook sans explication.
export const LINT_FILE_TIMEOUT_MS = 100_000;
export const STOP_BUDGET_MS = 570_000;
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

// Chemins protégés : fichiers qui décident de ce qui s'exécute sans confirmation (contrat hx, hooks, permissions,
// version d'OpenSpec lancée par npx), et specs principales, qui ne changent que par /opsx:sync ou /opsx:archive.
// Liste unique : elle sert à PreToolUse (confirmation) et à Stop (signalement, quel que soit l'outil qui a écrit).
const SPECS = 'openspec/specs/';
const CONTRACT = '.harness/config.json';
const EXECUTION_FILES = ['.harness/hx.mjs', '.harness/hooks.mjs', '.harness/versions.json', '.claude/settings.json', '.claude/settings.local.json'];
const EXECUTION_REASON = 'Ce fichier décide des commandes exécutées sans confirmation (contrat hx, hooks, permissions ou version d\'OpenSpec). Vérifie la modification avant de l\'accepter.';
const PROTECTED = [
  { test: (rel) => rel.startsWith(SPECS), reason: 'openspec/specs/ ne change que pendant /opsx:sync ou /opsx:archive. Confirme seulement dans ce cadre.' },
  { test: (rel) => rel === CONTRACT, reason: EXECUTION_REASON, contract: true },
  { test: (rel) => EXECUTION_FILES.includes(rel), reason: EXECUTION_REASON },
];
const isProtected = (rel) => PROTECTED.some((p) => p.test(CASE_INSENSITIVE_FS ? rel.toLowerCase() : rel));
// Exécution sans humain (evals de /hx-setup) : une confirmation y vaut refus, alors qu'écrire le contrat est la tâche.
// HX_ALLOW_CONFIG_EDITS=1 lève la confirmation sur .harness/config.json seulement ; hooks, permissions et specs restent protégés.
const protectedFor = (env) => PROTECTED.filter((p) => !(p.contract && env.HX_ALLOW_CONFIG_EDITS === '1'));
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Repérage best effort dans une commande (chemin cité littéralement) ; ce qui y échappe est signalé par le hook Stop.
const PROTECTED_IN_COMMAND = new RegExp(`(?:^|[\\s'"=/])(${[SPECS, CONTRACT, ...EXECUTION_FILES].map(escapeRegExp).join('|')})`, 'g');
// Lancer un script du harness (node .harness/hx.mjs …) ne l'écrit pas : ce chemin-là ne compte pas.
const RUNS_HARNESS_SCRIPT = /\bnode\s+["']?(?:\$CLAUDE_PROJECT_DIR\/)?\.harness\/(?:hx|hooks)\.mjs["']?/g;
// Commandes shell qui écrivent probablement les chemins cités dans leur segment (redirections traitées à part).
const WRITES = /\btee\b|\b(sed|perl)\b[^|;&]*\s-\w*i|--in-place|\b(mv|cp|rm|truncate|dd|ln)\s/;
// Écriture par un script (node -e, python heredoc…) : le chemin peut être dans une variable d'une autre ligne,
// donc toute la commande compte.
const SCRIPT_WRITES = /writeFile|\bopen\(/;
// Message de commit : du texte, pas une commande (« -m "lint -> eslint" » n'écrit rien).
const COMMIT_MESSAGE = /(?:\s-m|--message)(?:=|\s+)(?:"(?:\\.|[^"\\])*"|'[^']*')/g;

// Découpe une commande shell en segments (; && || | et saut de ligne, hors guillemets) et sort les cibles de
// redirection (> et >>, hors >&N et /dev/null). Best effort, pas un parseur shell : le hook Stop rattrape le reste.
function shellSegments(command) {
  const segments = [];
  let text = '';
  let targets = [];
  let quote = '';
  const flush = () => {
    segments.push({ text, targets });
    text = '';
    targets = [];
  };
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      text += c;
      if (c === '\\' && quote === '"') text += command[++i] ?? '';
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
      text += c;
    } else if (c === '\\') {
      text += c + (command[++i] ?? '');
    } else if (c === ';' || c === '\n' || c === '|' || (c === '&' && command[i + 1] === '&')) {
      if (command[i + 1] === c) i += 1;
      flush();
    } else if (c === '>') {
      let j = i + 1 + (command[i + 1] === '>' ? 1 : 0);
      if (command[j] === '&') {
        while (/[&\d-]/.test(command[j] ?? '')) j += 1;
      } else {
        while (command[j] === ' ' || command[j] === '\t') j += 1;
        let word = '';
        if (command[j] === '"' || command[j] === "'") {
          const end = command.indexOf(command[j], j + 1);
          word = command.slice(j + 1, end < 0 ? undefined : end);
          j = end < 0 ? command.length : end + 1;
        } else {
          while (j < command.length && !/[\s;&|<>]/.test(command[j])) word += command[j++];
        }
        if (word !== '/dev/null') targets.push(word);
      }
      text += ' ';
      i = j - 1;
    } else {
      text += c;
    }
  }
  flush();
  return segments;
}

// Textes où un chemin protégé cité serait écrit : cibles de redirection, et segments entiers d'une commande qui écrit.
function writtenByCommand(command) {
  const shell = command.replace(RUNS_HARNESS_SCRIPT, 'node');
  if (SCRIPT_WRITES.test(shell)) return [shell];
  return shellSegments(shell).flatMap(({ text, targets }) => {
    const code = /^\s*git\s/.test(text) ? text.replace(COMMIT_MESSAGE, ' ') : text;
    return [...targets, ...(WRITES.test(code) ? [code] : [])];
  });
}

// État de la session, hors du dépôt, une entrée par projet et session : commit de départ, et empreinte des fichiers
// déjà vus (modifiés avant la session, ou contrôlés au vert). Écrit seulement par SessionStart et Stop.
function sessionFile(root, input) {
  const key = createHash('sha256').update(`${realPath(root)}\0${input.session_id ?? 'sans-session'}`).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'hx-hooks', `${key}.json`);
}

function readState(root, input) {
  try {
    return JSON.parse(fs.readFileSync(sessionFile(root, input), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(root, input, state) {
  const file = sessionFile(root, input);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
}

function git(root, args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

// Racine du projet pour cet appel. CLAUDE_PROJECT_DIR reste sur le dossier principal même quand la session travaille
// dans un worktree du même dépôt (worktree natif de Claude Code Desktop, dans .claude/worktrees/) : sans ce
// détour, les contrôles porteraient sur le dossier principal. On suit alors le cwd de la session, au même
// sous-dossier du dépôt. Git compare les racines ; la nouvelle racine est dérivée du cwd, pas du chemin rendu par git
// (sous Windows, git rend le nom long d'un dossier que Node et Claude Code voient sous son nom court 8.3).
export function projectRoot(projectDir, input = {}) {
  const cwd = typeof input.cwd === 'string' && input.cwd;
  if (!cwd || realPath(cwd) === realPath(projectDir) || !fs.existsSync(cwd)) return projectDir;
  // [sous-dossier, racine du worktree, dépôt commun]
  const where = (dir) => git(dir, ['rev-parse', '--show-prefix', '--path-format=absolute', '--show-toplevel', '--git-common-dir'])?.split(/\r?\n/);
  const project = where(projectDir);
  const session = where(cwd);
  if (!project || !session || project[1] === session[1] || project[2] !== session[2]) return projectDir;
  const top = path.resolve(cwd, ...session[0].split('/').filter(Boolean).map(() => '..'));
  return path.join(top, project[0]);
}

// Fichiers modifiés depuis le commit base (commités ou non) et fichiers non suivis, relatifs à la racine, en « / ».
// Vu par git, donc quel que soit l'outil qui a écrit (Edit, Bash, script). null hors d'un dépôt git.
export function changedFiles(root, base = 'HEAD') {
  const untracked = git(root, ['ls-files', '-z', '--others', '--exclude-standard']);
  if (untracked === null) return null;
  // Dépôt sans commit (ou base disparue) : tous les fichiers suivis comptent.
  const tracked = git(root, ['diff', '--name-only', '-z', '--no-renames', '--relative', base]) ?? git(root, ['ls-files', '-z', '--cached']) ?? '';
  return [...new Set(`${tracked}\0${untracked}`.split('\0').filter(Boolean))];
}

// Empreinte du contenu (taille et date au-delà de 5 Mo) : deux écritures dans la même milliseconde restent distinctes.
function fingerprint(root, rel) {
  try {
    const file = path.join(root, rel);
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > 5 * 1024 * 1024) return `${st.size}:${st.mtimeMs}`;
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
  } catch {
    return 'absent';
  }
}

const snapshot = (root, files) => Object.fromEntries(files.map((rel) => [rel, fingerprint(root, rel)]));

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

// Contexte injecté au démarrage : projet à personnaliser, changes en cours, CLI openspec installée si besoin.
export function sessionStart(root, input, env = process.env) {
  // Point de départ du hook Stop, posé une seule fois par session (pas à la reprise ni au compactage) :
  // ce qui est déjà modifié avant Claude ne déclenche rien.
  if (!readState(root, input)) {
    const files = changedFiles(root);
    if (files) writeState(root, input, { base: git(root, ['rev-parse', 'HEAD'])?.trim() || null, seen: snapshot(root, files) });
  }
  const lines = [];
  if (readText(path.join(root, '.harness', 'project.md')).includes('hx:todo')) {
    lines.push("- Harness pas encore personnalisé : propose à l'utilisateur de lancer /hx-setup.");
  }
  let pinned = null;
  try {
    pinned = readVersions(root).openspec === undefined ? null : pinnedOpenspec(root);
  } catch (err) {
    lines.push(`- ${err.message} : CLI openspec non installée.`);
  }
  // En local, seulement si la CLI est absente : une autre version sert peut-être un autre projet (hx doctor le signale).
  const installed = pinned && installedOpenspecVersion();
  if (pinned && (env.CLAUDE_CODE_REMOTE === 'true' ? installed !== pinned : !installed)) {
    const r = spawnSync('npm', ['i', '-g', `@fission-ai/openspec@${pinned}`], { stdio: 'ignore', shell: process.platform === 'win32' });
    lines.push(r.status === 0
      ? `- CLI openspec ${pinned} installée (npm i -g).`
      : `- Échec de l'installation de la CLI openspec ${pinned} : les commandes /opsx:* ne fonctionneront pas. À lancer par l'utilisateur : npm i -g @fission-ai/openspec@${pinned}`);
  }
  for (const change of listChanges(root)) {
    const { done, total } = taskProgress(change.dir);
    const meta = readChangeMeta(change.dir);
    const gate = meta['x-validated'] ? `cadrage validé le ${meta['x-validated']}` : 'cadrage non validé';
    const report = reportVerdict(change.dir);
    lines.push(`- Change OpenSpec en cours : ${change.name} (piste ${meta['x-track'] ?? '?'}, ${gate}, ${done}/${total} tâches${report ? `, rapport : ${report}` : ''})`);
  }
  const elsewhere = worktreeStatus(root).filter((tree) => !tree.current).flatMap((tree) => tree.changes.map((c) => `${c.name} (${c.stage})`));
  if (elsewhere.length) lines.push(`- Changes dans d'autres worktrees : ${elsewhere.join(', ')}. Détail : node .harness/hx.mjs status`);
  if (lines.length) console.log(`Harness :\n${lines.join('\n')}`);
  return 0;
}

// Skills installés par OpenSpec qui court-circuitent le workflow du harness (réécrits par `openspec update` : on ne les modifie pas).
const REDIRECTED_SKILLS = {
  'openspec-apply-change': 'Le harness implémente un change avec hx-implement (sous-agent neuf par tâche, revue de conformité, preuve). Confirme seulement si l\'utilisateur a demandé openspec-apply-change explicitement.',
};

// Fichiers protégés : confirmation demandée, qu'ils soient édités par Edit/Write ou par une commande Bash qui écrit.
// Skills qui court-circuitent le workflow : confirmation aussi, avec l'alternative.
export function preToolUse(root, input, env = process.env) {
  const guarded = protectedFor(env);
  let reason;
  if (input.tool_name === 'Skill') {
    const skill = String(input.tool_input?.skill ?? '').replace(/^.*:/, '');
    reason = Object.hasOwn(REDIRECTED_SKILLS, skill) ? REDIRECTED_SKILLS[skill] : undefined;
  } else if (input.tool_name === 'Bash') {
    // Tous les chemins protégés écrits, pas seulement le premier ; un chemin seulement lu ne compte pas.
    const targets = writtenByCommand(String(input.tool_input?.command ?? '')).flatMap((text) => [...text.matchAll(PROTECTED_IN_COMMAND)].map((m) => m[1]));
    reason = targets.map((t) => guarded.find((p) => p.test(t))?.reason).find(Boolean);
  } else {
    const file = input.tool_input?.file_path;
    const rel = file && relative(root, file);
    if (rel) reason = guarded.find((p) => p.test(CASE_INSENSITIVE_FS ? rel.toLowerCase() : rel))?.reason;
  }
  if (!reason) return 0;
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
  return 0;
}

// Lint du fichier modifié, seulement si le composant définit « lint-file » (retour rapide).
export function postToolUse(root, input) {
  const file = input.tool_input?.file_path;
  if (!file) return 0;
  const rel = relative(root, file);
  const { config, code } = hookConfig(root);
  if (!config || NOT_CODE.test(rel)) return code;
  const failures = [];
  for (const inv of resolveInvocations(config, root, 'lint', { file: path.join(root, rel), fileOnly: true })) {
    const r = execute(inv.command, inv.cwd, { capture: true, timeout: LINT_FILE_TIMEOUT_MS });
    if (!r.ok) failures.push(`lint · ${inv.component} : ${inv.command}\n${tail(r.output, 30)}`);
  }
  if (!failures.length) return 0;
  console.error(failures.join('\n\n'));
  return FEEDBACK;
}

// Avant de rendre la main, d'après git (donc aussi pour les écritures faites par Bash) :
// - lint + typecheck des seuls composants dont le code a changé depuis le dernier passage au vert de la session ;
// - signalement à l'utilisateur des chemins protégés modifiés, que PreToolUse ait vu passer l'écriture ou non.
// Ce qui était déjà modifié au démarrage de la session ne déclenche rien. Hors d'un dépôt git : aucun contrôle.
export function stop(root, input) {
  if (input.stop_hook_active) return 0;
  const { config, code } = hookConfig(root);
  if (code) return code;
  const state = readState(root, input) ?? { base: null, seen: {} };
  const files = changedFiles(root, state.base ?? 'HEAD');
  if (!files) return 0;
  const fresh = files.filter((rel) => state.seen[rel] !== fingerprint(root, rel));
  const touched = new Set(config ? fresh
    .filter((rel) => !NOT_CODE.test(rel))
    .map((rel) => findComponentForFile(config, root, path.join(root, rel))?.component.name)
    .filter(Boolean) : []);
  const deadline = Date.now() + STOP_BUDGET_MS;
  const failures = [];
  for (const component of touched) {
    for (const step of FAST_STEPS) {
      for (const inv of resolveInvocations(config, root, step, { component })) {
        const left = deadline - Date.now();
        if (left <= 0) {
          failures.push(`${step} · ${inv.component} : non exécuté, budget du hook Stop épuisé`);
          continue;
        }
        const r = execute(inv.command, inv.cwd, { capture: true, timeout: left });
        if (!r.ok) failures.push(`${step} · ${inv.component} : ${inv.command}\n${tail(r.output, 30)}`);
      }
    }
  }
  if (failures.length) {
    console.error(`Le code modifié ne passe pas les contrôles rapides. Corrige avant de terminer, ou explique pourquoi c'est attendu.\n\n${failures.join('\n\n')}`);
    return FEEDBACK;
  }
  writeState(root, input, { ...state, seen: { ...state.seen, ...snapshot(root, fresh) } });
  const guarded = fresh.filter(isProtected);
  if (guarded.length) {
    console.log(JSON.stringify({
      systemMessage: `Harness : fichiers protégés modifiés pendant la session : ${guarded.join(', ')}. Vérifie le diff (git diff) avant de commiter.`,
    }));
  }
  return 0;
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
  const input = readInput();
  const root = projectRoot(process.env.CLAUDE_PROJECT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), input);
  process.exitCode = runHook(process.argv[2], root, input);
}
