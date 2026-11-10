#!/usr/bin/env node
// Hooks du harness, câblés dans .claude/settings.json. Les autres harness (Codex, OpenCode, Antigravity, DeepSeek
// Harness) appellent le même fichier avec « --tool <harness> » : leur protocole est traduit par adapters.mjs.
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
  adaptersDrift,
  confidence,
  execute,
  grantShipPass,
  noteShipDecision,
  findComponentForFile,
  installedOpenspecVersion,
  listChanges,
  loadValidConfig,
  nextAction,
  pinnedOpenspec,
  readChangeMeta,
  readText,
  readVersions,
  reportVerdict,
  resolveInvocations,
  shippedAction,
  tail,
  taskProgress,
  nextTask,
  changeState,
  RUN_LOG,
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
// Aucune confirmation demandée (le mode de permission de Claude Code en décide) : PreToolUse en informe Claude,
// Stop signale à l'utilisateur ceux modifiés pendant la session, quel que soit l'outil qui a écrit.
const SPECS = 'openspec/specs/';
const EXECUTION_FILES = [
  '.harness/config.json', '.harness/hx.mjs', '.harness/hooks.mjs', '.harness/adapters.mjs', '.harness/adapters.json', '.harness/versions.json',
  '.claude/settings.json', '.claude/settings.local.json',
  '.codex/hooks.json', '.codex/config.toml', '.codex/rules/harness.rules', '.agents/hooks.json',
  '.opencode/opencode.json', '.opencode/plugins/hx-harness.js', '.dsh/hooks.json', '.dsh/harness.patch.yml',
];
const EXECUTION_NOTE = 'Ce fichier décide des commandes exécutées sans confirmation (contrat hx, hooks, permissions ou version d\'OpenSpec). L\'utilisateur verra ce chemin signalé en fin de tour.';
const PROTECTED = [
  { test: (rel) => rel.startsWith(SPECS), note: 'Les specs principales (openspec/specs/) ne changent que pendant /opsx:sync ou /opsx:archive.' },
  { test: (rel) => EXECUTION_FILES.includes(rel), note: EXECUTION_NOTE },
];
const protectionOf = (rel) => PROTECTED.find((p) => p.test(CASE_INSENSITIVE_FS ? rel.toLowerCase() : rel));

// État de la session, hors du dépôt, une entrée par projet et session : commit de départ, empreinte des fichiers
// déjà vus (modifiés avant la session, ou contrôlés au vert), et livraison décidée par l'utilisateur (shipApproval).
// Écrit par SessionStart et Stop, et pour la livraison par UserPromptSubmit, PostToolUse (AskUserQuestion) et PreToolUse (hx-ship).
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

function initialState(root) {
  const files = changedFiles(root);
  return files && { base: git(root, ['rev-parse', 'HEAD'])?.trim() || null, seen: snapshot(root, files) };
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
    const state = initialState(root);
    if (state) writeState(root, input, state);
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
      : `- Échec de l'installation de la CLI openspec ${pinned} : les commandes /opsx:* ne fonctionneront pas. Propose à l'utilisateur de relancer l'installation pour lui (npm i -g @fission-ai/openspec@${pinned}) : il n'a rien à taper.`);
  }
  const trees = worktreeStatus(root);
  const here = trees.find((tree) => tree.current);
  for (const change of listChanges(root)) {
    const { done, total } = taskProgress(change.dir);
    const meta = readChangeMeta(change.dir);
    const gate = meta['x-validated'] ? `cadrage validé le ${meta['x-validated']}` : 'cadrage non validé';
    const report = reportVerdict(change.dir);
    const state = here?.changes.find((c) => c.name === change.name);
    lines.push(`- Change OpenSpec en cours : ${change.name} (piste ${meta['x-track'] ?? '?'}, ${gate}, ${done}/${total} tâches${report ? `, rapport : ${report}` : ''})${state ? ` → ${nextAction(state)}` : ''}`);
    // Compactage pendant un run : la conversation résumée ne suffit pas, l'état du run est dans les fichiers du change.
    if (input.source === 'compact' && changeState(change.dir).stage === 'run en cours') {
      const next = nextTask(change.dir);
      const log = `openspec/changes/${change.name}/${RUN_LOG}`;
      lines.push(`  Reprise après compactage : le run de ${change.name} continue sans rendre la main. ${next
        ? `Reprends hx-implement ${change.name}, à la tâche « ${next} » (les tâches cochées sont faites et commitées).`
        : 'Toutes les tâches sont cochées : hx-verify, puis hx-review.'} Relis ${log} : hypothèses et décisions des tâches faites, pour le rapport et pour les tâches suivantes.`);
    }
    if (state?.stage === 'validé, run à lancer') {
      lines.push(`  Run prêt à lancer : si l'utilisateur écrit « go » (ou ne demande rien d'autre), lance hx-implement ${change.name} sans autre question.`);
    }
  }
  const elsewhere = trees.filter((tree) => !tree.current).flatMap((tree) => tree.changes.map((c) => `${c.name} (${c.stage} → ${nextAction(c, { here: false })})`));
  if (elsewhere.length) lines.push(`- Changes dans d'autres worktrees : ${elsewhere.join(', ')}. Détail : node .harness/hx.mjs status`);
  const shipped = trees.filter((tree) => !tree.current && tree.shipped).map((tree) => `${tree.path} (${tree.branch}) : ${shippedAction(tree.shipped)}`);
  if (shipped.length) lines.push(`- Worktrees livrés : ${shipped.join(' ; ')}.`);
  if (here?.main && trees.some((tree) => tree.shipped === 'mergé')) {
    lines.push("  Au premier échange, propose en choix cliquable « Capitaliser et nettoyer » : git pull, hx-learn, puis pour chaque worktree mergé git worktree remove <dossier> et git branch -d <branche>.");
  }
  const stale = adaptersDrift(root);
  if (stale.length) lines.push(`- Fichiers des autres harness périmés (${stale.slice(0, 3).join(', ')}${stale.length > 3 ? '…' : ''}) : lance node .harness/hx.mjs adapters, puis commite.`);
  if (lines.length) console.log(`Harness :\n${lines.join('\n')}`);
  return 0;
}

// Question de livraison posée par hx-review (en-tête « Livraison ») : un choix de l'utilisateur qui dit « livrer »
// autorise /hx-ship une fois, lancé par Claude. Seule la réponse rendue par l'outil compte, jamais sa demande.
export const SHIP_HEADER = 'Livraison';
const approvesShip = (answer) => /\blivrer\b/i.test(answer) && !/ne pas livrer|pas maintenant/i.test(answer);

function shipAnswer(input) {
  const asked = (Array.isArray(input.tool_input?.questions) ? input.tool_input.questions : []).find((q) => q?.header === SHIP_HEADER);
  if (!asked?.question) return null;
  const res = input.tool_response;
  const text = typeof res === 'string' ? res : Array.isArray(res) ? res.map((b) => b?.text ?? '').join('\n') : null;
  const raw = res && typeof res === 'object' && !Array.isArray(res) ? res.answers?.[asked.question]
    : text?.split(`"${asked.question}"="`)[1]?.split('"')[0];
  return Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : null;
}

function recordShipDecision(root, input) {
  const answer = shipAnswer(input);
  if (answer === null) return 0;
  const state = readState(root, input) ?? initialState(root) ?? { base: null, seen: {} };
  const { shipApproval, ...rest } = state;
  writeState(root, input, approvesShip(answer) ? { ...rest, shipApproval: { at: new Date().toISOString(), answer } } : rest);
  noteShipDecision(root, approvesShip(answer) ? answer : null);
  return 0;
}

// Demande de livraison tapée par l'utilisateur, au même titre qu'un clic : « /hx-ship [change] » en début de message
// (« $hx-ship » sous Codex, « @hx-ship » sous OpenCode), ou
// « livre » à l'impératif en tête de phrase (« Livre-le », « ok, livre add-mult »). Une phrase négative (« ne livre
// pas », « pas maintenant ») retire une décision consignée. Seule la dernière ligne qui en parle compte : un rapport
// collé au-dessus ne décide rien.
const SHIP_ORDER = /(?:^|[.!?;:]\s*|\b(?:oui|ok|go|vas-y|bon|alors)[,\s]+)(?:livre|livrez|livrons)(?:-(?:le|la|les))?(?=$|[\s,.!?;:])/i;
const SHIP_REFUSAL = /\bne\s+(?:\S+\s+)?livre[sz]?\s+pas\b|ne pas livrer|\bpas (?:maintenant|encore)\b/i;

export function shipRequest(prompt) {
  const text = String(prompt ?? '').trim();
  if (/^[/$@](?:[\w-]+:)?hx-ship(?:\s|$)/.test(text)) return { decision: 'approve', said: text.split(/\r?\n/)[0] };
  const said = text.split(/\r?\n/).map((l) => l.trim()).findLast((l) => SHIP_REFUSAL.test(l) || SHIP_ORDER.test(l));
  if (!said) return null;
  return { decision: SHIP_REFUSAL.test(said) ? 'refuse' : 'approve', said: said.slice(0, 120) };
}

export function userPromptSubmit(root, input) {
  const request = shipRequest(input.prompt);
  if (!request) return 0;
  const state = readState(root, input) ?? initialState(root) ?? { base: null, seen: {} };
  const { shipApproval, ...rest } = state;
  writeState(root, input, request.decision === 'approve' ? { ...rest, shipApproval: { at: new Date().toISOString(), answer: request.said } } : rest);
  noteShipDecision(root, request.decision === 'approve' ? request.said : null);
  return 0;
}

// Skills installés par OpenSpec qui court-circuitent le workflow du harness (réécrits par `openspec update` : on ne les modifie pas).
// Refusés avec l'alternative : Claude bascule seul, sans solliciter l'utilisateur, qui garde /opsx:apply.
const REDIRECTED_SKILLS = {
  'openspec-apply-change': 'Le harness implémente un change avec hx-implement (sous-agent neuf par tâche, revue de conformité, preuve). Pour openspec-apply-change, l\'utilisateur lance /opsx:apply lui-même.',
};

// /hx-ship lancé par Claude (outil Skill) sans décision de livrer de l'utilisateur (clic ou message) : livraison automatique, permise
// seulement si `hx confidence` l'autorise. Renvoie la raison du refus, ou null.
function shipChange(root, args) {
  const named = String(args ?? '').trim().split(/\s+/)[0];
  const active = listChanges(root).map((c) => c.name);
  return named || (active.length === 1 ? active[0] : null);
}

function automaticShipRefusal(root, args) {
  const change = shipChange(root, args);
  const r = change ? confidence(root, change) : null;
  if (r?.auto) return null;
  const why = r ? `score ${r.score}/100, seuil ${r.threshold}${r.exclusions.length ? ` ; ${r.exclusions.join(' ; ')}` : ''}` : 'change non précisé';
  if (r?.next === 'fix') return `Livraison automatique refusée par hx confidence (${why}), mais le plafond ${r.ceiling} atteint le seuil : suis la boucle de correction de hx-review (${r.reason}), puis relance hx confidence.`;
  return `Livraison automatique refusée par hx confidence (${why}). Termine le rapport de fin de run par la question « ${SHIP_HEADER} » (choix cliquable, voir hx-review) : seule une décision de l'utilisateur (choix « livrer », ou message « livre <change> ») autorise /hx-ship.`;
}

// Ne demande jamais confirmation : le mode de permission (Auto de préférence) décide. Skill qui court-circuite le
// workflow, ou /hx-ship sans choix « livrer » de l'utilisateur ni livraison automatique permise : refusé avec
// l'alternative. Chemin protégé édité : contexte pour Claude.
export function preToolUse(root, input) {
  const output = (fields) => console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } }));
  if (input.tool_name === 'Skill') {
    const skill = String(input.tool_input?.skill ?? '').replace(/^.*:/, '');
    const redirect = Object.hasOwn(REDIRECTED_SKILLS, skill) ? REDIRECTED_SKILLS[skill] : null;
    if (skill === 'hx-ship') {
      const state = readState(root, input);
      if (state?.shipApproval) {
        const { shipApproval, ...rest } = state;
        writeState(root, input, rest);
        grantShipPass(root, shipChange(root, input.tool_input?.args), 'manual', shipApproval.answer);
        output({ additionalContext: `Livraison décidée par l'utilisateur (« ${shipApproval.answer} ») : mode manuel de /hx-ship. Mineurs proposés sans décision de l'utilisateur : demande-la avant l'archive.` });
        return 0;
      }
    }
    const refusal = skill === 'hx-ship' ? automaticShipRefusal(root, input.tool_input?.args) : redirect;
    if (refusal) output({ permissionDecision: 'deny', permissionDecisionReason: refusal });
    // Livraison automatique permise ici : la garde de l'archive (hx openspec archive) ne recalcule pas l'indice après le pull.
    else if (skill === 'hx-ship') grantShipPass(root, shipChange(root, input.tool_input?.args), 'auto');
    return 0;
  }
  const file = input.tool_input?.file_path;
  const note = file && protectionOf(relative(root, file))?.note;
  if (note) output({ additionalContext: note });
  return 0;
}

// Lint du fichier modifié, seulement si le composant définit « lint-file » (retour rapide). Réponse à la question
// de livraison : décision de l'utilisateur consignée pour PreToolUse.
export function postToolUse(root, input) {
  if (input.tool_name === 'AskUserQuestion') return recordShipDecision(root, input);
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
  const guarded = fresh.filter(protectionOf);
  if (guarded.length) {
    console.log(JSON.stringify({
      systemMessage: `Harness : fichiers protégés modifiés pendant la session : ${guarded.join(', ')}. Vérifie le diff (git diff) avant de commiter.`,
    }));
  }
  return 0;
}

const HANDLERS = { 'session-start': sessionStart, 'user-prompt-submit': userPromptSubmit, 'pre-tool-use': preToolUse, 'post-tool-use': postToolUse, stop };

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

// Sorties d'un handler (console.log, console.error) retenues au lieu d'être écrites : elles sont au format de Claude Code.
function captured(fn) {
  const logs = { out: [], err: [] };
  const { log, error } = console;
  console.log = (...args) => logs.out.push(args.join(' '));
  console.error = (...args) => logs.err.push(args.join(' '));
  try {
    return { code: fn(), out: logs.out.join('\n'), err: logs.err.join('\n') };
  } finally {
    Object.assign(console, { log, error });
  }
}

const parsed = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const MANAGED_NOTE = 'Fichier géré par le template Harness (mis à jour par copier update) : il ne s\'édite pas dans le projet.';

// Hook appelé par un autre harness que Claude Code : entrée traduite au format de Claude Code, mêmes handlers,
// résultat rendu dans le protocole du harness. Renvoie { stdout, stderr, code }.
export function runForeignHook(tool, event, raw, projectDir, adapters) {
  const { base, calls } = adapters.foreignInput(tool, raw);
  const root = projectRoot(projectDir, base);
  const result = { block: null, ask: false, approve: false, context: null, notice: null };
  const add = (key, text) => {
    if (text) result[key] = [result[key], text].filter(Boolean).join('\n\n');
  };
  const run = (input) => captured(() => runHook(event, root, { ...base, ...input }));
  const patchState = (patch) => writeState(root, base, { ...(readState(root, base) ?? initialState(root) ?? { base: null, seen: {} }), ...patch });

  if (event === 'session-start') add('context', run({}).out);
  if (event === 'user-prompt-submit') {
    // Antigravity appelle ce hook avant chaque appel au modèle : une même demande n'est lue qu'une fois, sinon une
    // décision de livrer déjà consommée reviendrait.
    const seen = createHash('sha256').update(String(base.prompt ?? '')).digest('hex').slice(0, 16);
    if (tool !== 'antigravity' || readState(root, base)?.lastPrompt !== seen) {
      run({});
      if (tool === 'antigravity') patchState({ lastPrompt: seen });
    }
    const pending = readState(root, base)?.pendingFeedback;
    if (pending) {
      add('context', pending);
      patchState({ pendingFeedback: null });
    }
  }
  if (event === 'pre-tool-use') {
    const source = adapters.readSource(root);
    for (const call of calls) {
      if (call.tool_name === 'Bash') {
        if (adapters.PRE_APPROVES.has(tool) && adapters.preApproved(source.allow, call.tool_input.command)) result.approve = true;
        continue;
      }
      const rel = call.tool_name === 'Edit' ? relative(root, call.tool_input.file_path) : null;
      if (rel !== null && source.deny.some((d) => d.toLowerCase() === rel.toLowerCase())) {
        add('block', `${rel} : ${MANAGED_NOTE}`);
        continue;
      }
      // Harness sans rules ciblées par chemin : la règle du fichier est donnée à sa première édition de la session.
      if (rel !== null && adapters.RULES_BY_HOOK.has(tool)) {
        const shown = readState(root, base)?.rulesShown ?? [];
        const fresh = adapters.rulesFor(source.rules, rel).filter((rule) => !shown.includes(rule.name));
        for (const rule of fresh) add('context', `Règle .claude/rules/${rule.name}.md, à appliquer à ${rel} et aux fichiers du même type :\n\n${rule.body.trim()}`);
        if (fresh.length) patchState({ rulesShown: [...shown, ...fresh.map((rule) => rule.name)] });
      }
      const decision = parsed(run(call).out)?.hookSpecificOutput ?? {};
      if (decision.permissionDecision === 'deny') {
        add('block', decision.permissionDecisionReason);
        result.ask ||= call.tool_input.skill === 'hx-ship';
      }
      add('context', decision.additionalContext);
    }
  }
  if (event === 'post-tool-use') {
    for (const call of calls) {
      const r = run(call);
      if (r.code === FEEDBACK) add('block', r.err);
    }
    if (result.block && adapters.DEFERRED_FEEDBACK.has(tool)) {
      patchState({ pendingFeedback: [readState(root, base)?.pendingFeedback, result.block].filter(Boolean).join('\n\n') });
      result.block = null;
    }
  }
  if (event === 'stop') {
    const guard = adapters.NO_STOP_GUARD.has(tool);
    const r = run(guard ? { stop_hook_active: readState(root, base)?.stopBlocked === true } : {});
    if (r.code === FEEDBACK) add('block', r.err);
    add('notice', parsed(r.out)?.systemMessage);
    if (guard) patchState({ stopBlocked: r.code === FEEDBACK });
  }
  return adapters.foreignOutput(tool, event, result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const input = readInput();
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const tool = process.argv[3] === '--tool' ? process.argv[4] : null;
  if (tool) {
    // Un hook ne casse jamais une session : harness inconnu ou erreur de traduction, on laisse passer.
    try {
      const adapters = await import('./adapters.mjs');
      const r = adapters.TOOLS[tool] && HANDLERS[process.argv[2]] ? runForeignHook(tool, process.argv[2], input, projectDir, adapters) : { stdout: '', stderr: `hooks : « ${process.argv[2]} --tool ${tool} » inconnu, ignoré`, code: 0 };
      if (r.stdout) process.stdout.write(`${r.stdout}\n`);
      if (r.stderr) process.stderr.write(`${r.stderr}\n`);
      process.exitCode = r.code;
    } catch (err) {
      console.error(`hooks : ${process.argv[2]} (${tool}) a échoué (${err.message}), ignoré`);
    }
  } else {
    process.exitCode = runHook(process.argv[2], projectRoot(projectDir, input), input);
  }
}
