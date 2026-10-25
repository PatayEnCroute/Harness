#!/usr/bin/env node
// hx : contrat de commandes du harness. Aucune dépendance (Node >= 20.19, déjà requis par OpenSpec).
// Fichier géré par le template Harness : les améliorations se font dans Harness, puis `copier update`.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MIN_NODE = [20, 19];
export const CHECK_STEPS = ['lint', 'typecheck', 'arch', 'test'];
export const FAST_STEPS = ['lint', 'typecheck'];
export const DOCTOR_STEPS = ['lint', 'typecheck', 'build', 'arch', 'test'];
export const CONFIG_PATH = '.harness/config.json';
const LOCAL_SETTINGS = '.claude/settings.local.json';

const VALUE_FLAGS = new Set(['file', 'component', 'path', 'branch', 'since']);
const TAIL_LINES = 60;
const IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  'coverage', 'venv', '__pycache__', 'openspec',
]);
const SOURCE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte', '.py', '.cs', '.fs',
  '.vb', '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.rb', '.php', '.swift', '.c', '.h', '.cc',
  '.cpp', '.hpp', '.dart', '.ex', '.exs', '.clj', '.sql',
]);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function defaultConfig() {
  return {
    $schema: './config.schema.json',
    version: 1,
    components: {},
    architecture: {
      style: 'feature-first',
      level: 1,
      features: {},
      profile: { size: null, lifespan: null, domain_complexity: null },
    },
    trace: { min_coverage: 100 },
    tracks: {
      S: { spec: false },
      M: { spec: true, design: 'optional' },
      L: { spec: true, design: 'required', adr: 'required' },
    },
  };
}

// Complète un contrat existant avec les clés ajoutées depuis par le template, sans jamais remplacer une valeur.
// config.json est spécifique (_skip_if_exists) : sans cela, une clé nouvelle n'atteindrait jamais les projets existants.
export function migrateConfig(config) {
  const fill = (target, defaults) => {
    const added = [];
    for (const [key, value] of Object.entries(defaults)) {
      if (!(key in target)) {
        target[key] = structuredClone(value);
        added.push(key);
      } else if (isObject(value) && isObject(target[key]) && !['components', 'features'].includes(key)) {
        added.push(...fill(target[key], value).map((k) => `${key}.${k}`));
      }
    }
    return added;
  };
  const migrated = structuredClone(config);
  return { config: migrated, added: fill(migrated, defaultConfig()) };
}

export function loadConfig(root) {
  const file = path.join(root, CONFIG_PATH);
  if (!fs.existsSync(file)) return { file, config: null, error: 'absent' };
  try {
    return { file, config: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { file, config: null, error: `JSON invalide : ${err.message}` };
  }
}

export function writeConfig(root, config) {
  const file = path.join(root, CONFIG_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

export function readVersions(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.harness', 'versions.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function components(config) {
  return Object.entries(config?.components ?? {}).map(([name, c]) => ({
    name,
    path: c?.path ?? '.',
    stack: c?.stack,
    commands: c?.commands ?? {},
  }));
}

const isLevel = (v) => Number.isInteger(v) && v >= 0 && v <= 4;
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const REQUIREMENT = ['optional', 'required'];

// Erreurs « structurelles » : les commandes du contrat ne peuvent pas s'exécuter correctement.
// Les autres erreurs (aucun test, niveaux, pistes…) rendent le contrat incomplet sans empêcher `hx run`.
export function validateConfig(config, root) {
  const issues = [];
  const add = (level, label, detail = '') => issues.push({ level, label, detail });
  const broken = (label, detail) => issues.push({ level: 'error', label, detail, structural: true });
  if (config.version !== 1) add('warn', 'Version du contrat', `attendu 1, trouvé ${config.version}`);
  if (!isObject(config.components)) {
    broken('Contrat', '« components » doit être un objet');
    return issues;
  }
  const comps = components(config);
  if (comps.length === 0) add('error', 'Composants', 'aucun : lance /hx-setup (ou hx detect --write)');
  for (const c of comps) {
    const label = `Composant ${c.name}`;
    if (typeof c.path !== 'string' || !fs.existsSync(path.resolve(root, c.path))) {
      broken(label, `dossier introuvable : ${c.path}`);
    }
    if (!isObject(c.commands)) {
      broken(label, '« commands » doit être un objet');
      continue;
    }
    for (const [name, cmd] of Object.entries(c.commands)) {
      if (typeof cmd !== 'string' || cmd.trim() === '') broken(label, `commande « ${name} » vide ou invalide`);
      else if (name.endsWith('-file') && !cmd.includes('{file}')) broken(label, `« ${name} » doit contenir {file}`);
    }
    if (!c.commands.test) add('warn', label, 'pas de commande « test »');
    if (!c.commands.lint) add('warn', label, 'pas de commande « lint »');
  }
  if (comps.length > 0 && !comps.some((c) => isObject(c.commands) && c.commands.test)) {
    add('error', 'Tests', 'aucun composant ne définit « test »');
  }
  const arch = config.architecture ?? {};
  if (arch.level !== undefined && !isLevel(arch.level)) add('error', 'Architecture', 'level doit valoir 0 à 4');
  for (const [feature, level] of Object.entries(arch.features ?? {})) {
    if (!isLevel(level)) add('error', 'Architecture', `niveau de « ${feature} » : 0 à 4`);
  }
  if (config.trace?.test_pattern !== undefined) {
    try {
      new RegExp(config.trace.test_pattern);
    } catch {
      add('error', 'Trace', 'test_pattern doit être une expression régulière valide');
    }
  }
  const min = config.trace?.min_coverage;
  if (min !== undefined && !(Number.isInteger(min) && min >= 0 && min <= 100)) {
    add('error', 'Trace', 'min_coverage doit être un entier de 0 à 100');
  }
  for (const [name, rules] of Object.entries(config.tracks ?? {})) {
    if (!isObject(rules)) add('error', 'Pistes', `« ${name} » doit être un objet`);
    else {
      if (rules.spec !== undefined && typeof rules.spec !== 'boolean') add('error', 'Pistes', `${name}.spec : true ou false`);
      for (const key of ['design', 'adr']) {
        if (rules[key] !== undefined && !REQUIREMENT.includes(rules[key])) add('error', 'Pistes', `${name}.${key} : optional ou required`);
      }
    }
  }
  return issues;
}

// Contrat chargé puis validé : config null s'il est absent ou illisible.
// errors : toutes les erreurs, ou seulement les structurelles avec { structural: true }.
export function loadValidConfig(root, { structural = false } = {}) {
  const { config, error } = loadConfig(root);
  if (!config) return { config: null, errors: error === 'absent' ? [] : [`${CONFIG_PATH} : ${error}`] };
  const errors = validateConfig(config, root)
    .filter((i) => i.level === 'error' && (!structural || i.structural))
    .map((i) => `${i.label} : ${i.detail}`);
  return { config, errors };
}

export function isUnknownComponent(config, name) {
  return Boolean(name) && !Object.hasOwn(isObject(config.components) ? config.components : {}, name);
}

// ---------------------------------------------------------------------------
// Résolution des commandes
// ---------------------------------------------------------------------------

export function shellQuote(value, platform = process.platform) {
  if (/^[\w@%+=:,./\\-]+$/.test(value)) return value;
  if (platform === 'win32') return `"${value.replace(/"/g, '""')}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function findComponentForFile(config, root, file) {
  const abs = path.resolve(file);
  let best = null;
  for (const c of components(config)) {
    const dir = path.resolve(root, c.path);
    const inside = abs === dir || abs.startsWith(dir.endsWith(path.sep) ? dir : dir + path.sep);
    if (inside && (!best || dir.length > best.dir.length)) best = { component: c, dir };
  }
  return best && { component: best.component, relative: path.relative(best.dir, abs) };
}

// Renvoie la liste des commandes à exécuter : [{ component, command, cwd }].
// fileOnly : avec --file, n'exécute que la variante « -file » (sinon rien), pour les hooks rapides.
export function resolveInvocations(config, root, name, { component, file, fileOnly = false } = {}) {
  if (file) {
    const match = findComponentForFile(config, root, file);
    if (!match) return [];
    const { component: c, relative } = match;
    const perFile = c.commands[`${name}-file`];
    const command = perFile ? perFile.replaceAll('{file}', shellQuote(relative)) : fileOnly ? undefined : c.commands[name];
    return command ? [{ component: c.name, command, cwd: path.resolve(root, c.path) }] : [];
  }
  return components(config)
    .filter((c) => (!component || c.name === component) && c.commands[name])
    .map((c) => ({ component: c.name, command: c.commands[name], cwd: path.resolve(root, c.path) }));
}

let installedOpenspec;

// Version de la CLI openspec présente dans le PATH, ou null.
export function installedOpenspecVersion() {
  if (installedOpenspec === undefined) {
    const r = spawnSync('openspec --version', { shell: true, encoding: 'utf8', env: env() });
    installedOpenspec = r.status === 0 ? r.stdout.trim() : null;
  }
  return installedOpenspec;
}

// Version épinglée d'OpenSpec (« latest » si versions.json n'en donne pas). Elle part dans une commande npx :
// une valeur hors format est une erreur, jamais transmise au shell ni remplacée en silence.
export function pinnedOpenspec(root) {
  const version = readVersions(root).openspec;
  if (version === undefined) return 'latest';
  if (typeof version !== 'string' || !/^[\w.-]+$/.test(version)) {
    throw new Error(`.harness/versions.json : version d'OpenSpec invalide (${JSON.stringify(version)})`);
  }
  return version;
}

// Préfère la CLI installée si elle a la version épinglée (plus rapide, hors ligne), sinon npx.
export function openspecCommand(root, args) {
  const version = pinnedOpenspec(root);
  const binary = installedOpenspecVersion() === version ? ['openspec'] : ['npx', '-y', `@fission-ai/openspec@${version}`];
  return [...binary, ...args].map((a) => shellQuote(a)).join(' ');
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

const env = () => ({ ...process.env, OPENSPEC_TELEMETRY: '0' });

// timeout (ms) : au-delà, la commande est arrêtée et compte comme un échec (les hooks ont un délai imposé par Claude Code).
export function execute(command, cwd, { capture, timeout } = {}) {
  const started = Date.now();
  const r = spawnSync(command, {
    cwd,
    shell: true,
    env: env(),
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...(timeout ? { timeout, killSignal: 'SIGTERM' } : {}),
  });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const output = (capture ? `${r.stdout ?? ''}${r.stderr ?? ''}` : '')
    + (timedOut ? `\nhx : délai de ${Math.round(timeout / 1000)} s dépassé, commande arrêtée` : '');
  return { ok: r.status === 0 && !timedOut, code: r.status ?? 1, ms: Date.now() - started, output, timedOut };
}

export function tail(text, lines = TAIL_LINES) {
  const all = text.trimEnd().split('\n');
  return (all.length > lines ? [`… (${all.length - lines} lignes masquées)`, ...all.slice(-lines)] : all).join('\n');
}

function runStep(step, opts) {
  if (opts.verbose) console.log(`\n▶ ${step.label} · ${step.component} : ${step.command}`);
  const result = execute(step.command, step.cwd, { capture: !opts.verbose });
  if (!result.ok && result.output) {
    console.log(`\n✗ ${step.label} · ${step.component} : ${step.command}\n${tail(result.output)}`);
  }
  return { ...step, ...result };
}

// Étape exécutée dans le processus (pistes, trace) : fn renvoie { ok, output, notice }.
function inProcessStep(label, fn, opts) {
  const started = Date.now();
  const { ok, output, notice } = fn();
  if (output && (!ok || notice || opts.verbose)) console.log(`\n${ok ? '▶' : '✗'} ${label}\n${output}`);
  return { label, component: '—', ok, ms: Date.now() - started, output };
}

const fmtMs = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function printResults(title, results) {
  console.log(`\n${title}`);
  for (const r of results) {
    const icon = r.skipped ? '·' : r.ok ? '✓' : '✗';
    const right = r.reason ?? fmtMs(r.ms);
    console.log(`  ${icon} ${r.label.padEnd(12)} ${r.component.padEnd(16)} ${right}`);
  }
}

// ---------------------------------------------------------------------------
// Détection déterministe des stacks (point de départ de /hx-setup)
// ---------------------------------------------------------------------------

export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const skipDir = (name) => name.startsWith('.') || IGNORED_DIRS.has(name);

// Parcours en largeur : les parents passent avant leurs enfants.
function walkDirs(root, maxDepth) {
  const out = [];
  const queue = [{ rel: '', depth: 0 }];
  while (queue.length) {
    const { rel, depth } = queue.shift();
    const entries = listDir(path.join(root, rel));
    out.push({ rel, files: new Set(entries.filter((e) => e.isFile()).map((e) => e.name)) });
    if (depth >= maxDepth) continue;
    for (const e of entries) {
      if (e.isDirectory() && !skipDir(e.name)) queue.push({ rel: rel ? `${rel}/${e.name}` : e.name, depth: depth + 1 });
    }
  }
  return out;
}

const isInside = (child, parent) => (parent === '' ? child !== '' : child.startsWith(`${parent}/`));
const hasDir = (root, rel, name) => fs.existsSync(path.join(root, rel, name));

function detectNode(root, dir) {
  if (!dir.files.has('package.json')) return null;
  const pkg = readJson(path.join(root, dir.rel, 'package.json')) ?? {};
  const scripts = pkg.scripts ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const pm = dir.files.has('pnpm-lock.yaml') ? 'pnpm'
    : dir.files.has('yarn.lock') ? 'yarn'
      : dir.files.has('bun.lock') || dir.files.has('bun.lockb') ? 'bun' : 'npm';
  const run = (script) => `${pm} run ${script}`;
  const commands = {};
  const notes = [];
  commands.setup = {
    npm: dir.files.has('package-lock.json') ? 'npm ci' : 'npm install',
    pnpm: 'pnpm install --frozen-lockfile',
    yarn: dir.files.has('.yarnrc.yml') ? 'yarn install --immutable' : 'yarn install --frozen-lockfile',
    bun: 'bun install --frozen-lockfile',
  }[pm];
  if (scripts.build) commands.build = run('build');
  if (scripts.lint) commands.lint = run('lint');
  if (deps.eslint) commands['lint-file'] = 'npx eslint {file}';
  else if (deps['@biomejs/biome']) commands['lint-file'] = 'npx biome lint {file}';
  const typecheck = ['typecheck', 'type-check', 'check-types', 'tsc'].find((s) => scripts[s]);
  if (typecheck) commands.typecheck = run(typecheck);
  else if (dir.files.has('tsconfig.json') && deps.typescript) commands.typecheck = 'npx tsc --noEmit';
  if (scripts.test && !/no test specified/.test(scripts.test)) {
    commands.test = run('test');
    if (deps.vitest) commands['test-file'] = 'npx vitest run {file}';
    else if (deps.jest) commands['test-file'] = 'npx jest {file}';
    else if (deps.mocha) commands['test-file'] = 'npx mocha {file}';
    else if (/node --test/.test(scripts.test)) commands['test-file'] = 'node --test {file}';
  } else {
    notes.push('aucun script « test » dans package.json');
  }
  const coversNested = Boolean(pkg.workspaces) || dir.files.has('pnpm-workspace.yaml');
  return { stack: 'node', commands, notes, coversNested, nameHint: pkg.name };
}

function detectPython(root, dir, { python }) {
  const markers = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'];
  if (!markers.some((m) => dir.files.has(m))) return null;
  const text = [...dir.files]
    .filter((f) => markers.includes(f) || /^requirements.*\.txt$/.test(f))
    .map((f) => readText(path.join(root, dir.rel, f)))
    .join('\n');
  const mentions = (tool) => new RegExp(`(^|[^\\w-])${tool}([^\\w-]|$)`, 'mi').test(text);
  const runner = dir.files.has('uv.lock') ? 'uv run ' : dir.files.has('poetry.lock') ? 'poetry run ' : '';
  const py = `${runner}${runner ? 'python' : python}`;
  const commands = {};
  const notes = [];
  if (dir.files.has('uv.lock')) commands.setup = 'uv sync';
  else if (dir.files.has('poetry.lock')) commands.setup = 'poetry install';
  else if (dir.files.has('requirements.txt')) commands.setup = `${py} -m pip install -r requirements.txt`;
  if (mentions('ruff') || dir.files.has('ruff.toml') || dir.files.has('.ruff.toml')) {
    commands.lint = `${py} -m ruff check .`;
    commands['lint-file'] = `${py} -m ruff check {file}`;
  } else if (mentions('flake8')) {
    commands.lint = `${py} -m flake8`;
  }
  if (mentions('mypy')) commands.typecheck = `${py} -m mypy .`;
  if (mentions('pytest') || dir.files.has('pytest.ini') || dir.files.has('conftest.py')) {
    commands.test = `${py} -m pytest`;
    commands['test-file'] = `${py} -m pytest {file}`;
  } else {
    const start = ['tests', 'test'].find((d) => hasDir(root, dir.rel, d));
    commands.test = `${py} -m unittest discover${start ? ` -s ${start}` : ''}`;
    commands['test-file'] = `${py} -m unittest {file}`;
    notes.push('pytest non détecté : unittest utilisé');
  }
  const nameHint = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(readText(path.join(root, dir.rel, 'pyproject.toml')))?.[1];
  return { stack: 'python', commands, notes, coversNested: false, nameHint };
}

function detectDotnet(root, dir) {
  const files = [...dir.files].sort();
  const solutions = files.filter((f) => /\.slnx?$/i.test(f));
  const projects = files.filter((f) => /\.(cs|fs|vb)proj$/i.test(f));
  if (!solutions.length && !projects.length) return null;
  const notes = [];
  const target = shellQuote(solutions[0] ?? projects[0]);
  if (solutions.length > 1) notes.push(`plusieurs solutions : ${solutions[0]} retenue`);
  else if (!solutions.length && projects.length > 1) notes.push(`plusieurs projets sans solution : ${projects[0]} retenu`);
  const commands = {
    setup: `dotnet restore ${target}`,
    build: `dotnet build ${target}`,
    lint: `dotnet format ${target} --verify-no-changes`,
  };
  const isTestProject = /Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true/i.test(readText(path.join(root, dir.rel, projects[0] ?? '')));
  if (solutions.length || isTestProject) commands.test = `dotnet test ${target}`;
  return { stack: 'dotnet', commands, notes, coversNested: solutions.length > 0 };
}

function detectGo(root, dir) {
  if (!dir.files.has('go.mod')) return null;
  const commands = {
    setup: 'go mod download',
    build: 'go build ./...',
    lint: 'go vet ./...',
    test: 'go test ./...',
  };
  return { stack: 'go', commands, notes: [], coversNested: false };
}

function detectRust(root, dir) {
  if (!dir.files.has('Cargo.toml')) return null;
  const commands = {
    setup: 'cargo fetch',
    build: 'cargo build',
    typecheck: 'cargo check',
    lint: 'cargo clippy --all-targets -- -D warnings',
    test: 'cargo test',
  };
  const coversNested = /^\s*\[workspace\]/m.test(readText(path.join(root, dir.rel, 'Cargo.toml')));
  return { stack: 'rust', commands, notes: [], coversNested };
}

function detectJvm(root, dir) {
  if (dir.files.has('pom.xml')) {
    const mvn = dir.files.has('mvnw') ? './mvnw' : 'mvn';
    const commands = { build: `${mvn} -q -DskipTests package`, test: `${mvn} -q test` };
    return { stack: 'maven', commands, notes: [], coversNested: true };
  }
  if (['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some((f) => dir.files.has(f))) {
    const gradle = dir.files.has('gradlew') ? './gradlew' : 'gradle';
    const commands = { build: `${gradle} build -x test`, test: `${gradle} test` };
    return { stack: 'gradle', commands, notes: [], coversNested: true };
  }
  return null;
}

const DETECTORS = [detectDotnet, detectNode, detectPython, detectGo, detectRust, detectJvm];

function defaultPython() {
  return spawnSync('python', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0
    ? 'python'
    : 'python3';
}

const slug = (s) => String(s).toLowerCase().replace(/^@[^/]+\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';

export function sourceStats(root, { maxFiles = 50000 } = {}) {
  let files = 0;
  let loc = 0;
  const stack = [root];
  while (stack.length && files < maxFiles) {
    const dir = stack.pop();
    for (const e of listDir(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skipDir(e.name)) stack.push(full);
      } else if (e.isFile() && SOURCE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        files += 1;
        const size = fs.statSync(full).size;
        if (size < 2 * 1024 * 1024) loc += readText(full).split('\n').length;
      }
    }
  }
  // Seuils indicatifs : /hx-setup les confronte au besoin réel avec l'utilisateur.
  const sizeHint = loc < 3000 ? 'small' : loc < 30000 ? 'medium' : 'large';
  return { files, loc, sizeHint };
}

export function detect(root, { maxDepth = 3, python = defaultPython() } = {}) {
  const found = [];
  const covered = [];
  for (const dir of walkDirs(root, maxDepth)) {
    for (const detector of DETECTORS) {
      const result = detector(root, dir, { python });
      if (!result) continue;
      if (covered.some((c) => c.stack === result.stack && isInside(dir.rel, c.rel))) continue;
      found.push({ ...result, path: dir.rel || '.' });
      if (result.coversNested) covered.push({ stack: result.stack, rel: dir.rel });
    }
  }
  const out = {};
  const notes = [];
  for (const c of found) {
    let name = c.path === '.' ? slug(c.nameHint ?? path.basename(path.resolve(root))) : slug(path.basename(c.path));
    if (out[name]) name = `${name}-${c.stack}`;
    if (out[name]) name = slug(`${c.path}-${c.stack}`);
    out[name] = { path: c.path, stack: c.stack, commands: c.commands };
    for (const note of c.notes) notes.push(`${name} : ${note}`);
  }
  if (found.length === 0) notes.push('aucune stack reconnue : complète .harness/config.json à la main');
  return { components: out, notes, stats: sourceStats(root) };
}

// ---------------------------------------------------------------------------
// OpenSpec : changes, pistes, traçabilité (lecture directe du Markdown)
// ---------------------------------------------------------------------------

const TRACE_EXTENSIONS = new Set([...SOURCE_EXTENSIONS, '.feature', '.robot']);
// Fichiers de test reconnus par défaut : les conventions de .claude/rules/testing.md, plus specs?/, e2e/, .feature et .robot
// (scénarios exécutables) ; trace.test_pattern le remplace.
export const DEFAULT_TEST_PATTERN = String.raw`(^|/)(tests?|__tests__|specs?|e2e)/|\.(test|spec)\.[^/]+$|_(test|spec)\.[^/]+$|(^|/)test_[^/]+\.py$|Tests?\.(cs|fs|vb|java|kt|scala|swift)$|\.(feature|robot)$`;
const SCENARIO_TAG = /@scenario\s+([a-z0-9](?:[a-z0-9/_-]*[a-z0-9])?)/g;
const toPosix = (p) => p.split(path.sep).join('/');

export function slugify(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function walkFiles(dir, accept, { skip = skipDir } = {}, out = []) {
  for (const e of listDir(dir)) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!skip(e.name)) walkFiles(full, accept, { skip }, out);
    } else if (e.isFile() && accept(full)) {
      out.push(full);
    }
  }
  return out;
}

// Scénarios d'un fichier de spec : [{ requirement, scenario, section }].
// section : null dans une spec principale, ADDED / MODIFIED / REMOVED / RENAMED dans un delta.
export function parseScenarios(markdown) {
  const out = [];
  let section = null;
  let requirement = null;
  for (const line of markdown.split(/\r?\n/)) {
    const delta = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\b/i.exec(line);
    if (delta) section = delta[1].toUpperCase();
    else if (/^##\s/.test(line)) section = null;
    const req = /^###\s+Requirement:\s*(.+?)\s*$/.exec(line);
    if (req) requirement = req[1];
    const scenario = /^####\s+Scenario:\s*(.+?)\s*$/.exec(line);
    if (scenario) out.push({ requirement, scenario: scenario[1], section });
  }
  return out;
}

// Fichiers spec.md d'un dossier, avec leur capability (chemin relatif du dossier parent).
function specFiles(dir) {
  return walkFiles(dir, (f) => path.basename(f) === 'spec.md', { skip: (name) => name.startsWith('.') })
    .map((file) => ({ file, capability: toPosix(path.relative(dir, path.dirname(file))) }));
}

export function listChanges(root, { archived = false } = {}) {
  const base = path.join(root, 'openspec', 'changes');
  const dirs = (dir) => listDir(dir).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const active = dirs(base).filter((e) => e.name !== 'archive')
    .map((e) => ({ name: e.name, dir: path.join(base, e.name), archived: false }));
  if (!archived) return active;
  const done = dirs(path.join(base, 'archive'))
    .map((e) => ({ name: e.name, dir: path.join(base, 'archive', e.name), archived: true }));
  return [...active, ...done];
}

// Clés de premier niveau de .openspec.yaml (format plat « clé: valeur »).
export function readChangeMeta(dir) {
  const meta = {};
  for (const line of readText(path.join(dir, '.openspec.yaml')).split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return meta;
}

export function taskProgress(dir) {
  const tasks = readText(path.join(dir, 'tasks.md'));
  const done = (tasks.match(/^\s*-\s*\[[xX]\]/gm) ?? []).length;
  return { done, total: done + (tasks.match(/^\s*-\s*\[ \]/gm) ?? []).length };
}

// Scénarios attendus : tous ceux des specs principales, et les ADDED / MODIFIED des changes en cours.
// complete : toutes les tâches du change sont cochées ; avant, un scénario sans test n'est qu'un avertissement.
// empty : specs où aucun scénario n'a été lu alors qu'il en faut (format inattendu) ; sans cela, 0 scénario vaudrait 100 %.
export function collectScenarios(root) {
  const id = (capability, scenario) => `${capability}/${slugify(scenario)}`;
  const empty = [];
  const main = specFiles(path.join(root, 'openspec', 'specs')).flatMap(({ file, capability }) => {
    const found = parseScenarios(readText(file)).map((s) => ({ ...s, capability, id: id(capability, s.scenario) }));
    if (!found.length) empty.push(toPosix(path.relative(root, file)));
    return found;
  });
  const changes = listChanges(root).flatMap((change) => {
    const { done, total } = taskProgress(change.dir);
    const complete = total > 0 && done === total;
    return specFiles(path.join(change.dir, 'specs')).flatMap(({ file, capability }) => {
      const text = readText(file);
      const found = parseScenarios(text)
        .filter((s) => s.section === 'ADDED' || s.section === 'MODIFIED')
        .map((s) => ({ ...s, capability, id: id(capability, s.scenario), change: change.name, complete }));
      if (!found.length && /^##\s+(ADDED|MODIFIED)\s+Requirements\b/im.test(text)) empty.push(toPosix(path.relative(root, file)));
      return found;
    });
  });
  return { main, changes, empty, duplicates: duplicateIds([...main, ...changes]) };
}

// Deux scénarios d'une capability au même slug partagent un identifiant : un seul tag les couvrirait tous les deux.
function duplicateIds(scenarios) {
  const groups = new Map();
  for (const s of scenarios) {
    const key = `${s.change ?? ''}\0${s.id}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()].filter((g) => g.length > 1)
    .map((g) => ({ id: g[0].id, change: g[0].change ?? null, requirements: g.map((s) => s.requirement) }));
}

// Tags « @scenario <capability>/<scénario> » : Map id → ["fichier:ligne"].
// Seuls les fichiers de test couvrent un scénario ; un tag ailleurs (code de production) est rangé dans « ignored ».
export function collectTags(root, { testPattern = DEFAULT_TEST_PATTERN } = {}) {
  const isTest = new RegExp(testPattern);
  const tags = new Map();
  const ignored = new Map();
  for (const file of walkFiles(root, (f) => TRACE_EXTENSIONS.has(path.extname(f).toLowerCase()))) {
    const text = readText(file);
    if (!text.includes('@scenario')) continue;
    const rel = toPosix(path.relative(root, file));
    const target = isTest.test(rel) ? tags : ignored;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(SCENARIO_TAG)) target.set(m[1], [...(target.get(m[1]) ?? []), `${rel}:${i + 1}`]);
    });
  }
  return Object.assign(tags, { ignored });
}

export function trace(root, config) {
  const { main, changes, empty, duplicates } = collectScenarios(root);
  const tags = collectTags(root, { testPattern: config?.trace?.test_pattern });
  const known = new Set([...main, ...changes].map((s) => s.id));
  const uncoveredMain = main.filter((s) => !tags.has(s.id));
  const untested = changes.filter((s) => !tags.has(s.id));
  const uncoveredChanges = untested.filter((s) => s.complete);
  const pendingChanges = untested.filter((s) => !s.complete);
  const orphans = [...tags].filter(([id]) => !known.has(id)).map(([id, where]) => ({ id, where }));
  const covered = main.length - uncoveredMain.length;
  const coverage = main.length ? Math.floor((covered / main.length) * 100) : 100;
  const min = config?.trace?.min_coverage ?? 100;
  const ok = uncoveredChanges.length === 0 && duplicates.length === 0 && orphans.length === 0 && empty.length === 0 && coverage >= min;
  const outsideTests = [...tags.ignored].map(([id, where]) => ({ id, where }));
  return {
    ok, scenarios: main.length, covered, coverage, min,
    changeScenarios: changes.length, changesCovered: changes.length - untested.length,
    uncoveredChanges, pendingChanges, uncoveredMain, duplicates, orphans, outsideTests, empty,
  };
}

export function formatTrace(report, { limit = 20 } = {}) {
  const lines = [`Specs principales : ${report.covered}/${report.scenarios} scénarios couverts (${report.coverage} %, minimum ${report.min} %)`];
  if (report.changeScenarios) lines.push(`Changes en cours : ${report.changesCovered}/${report.changeScenarios} scénarios couverts`);
  const list = (title, items) => {
    if (!items.length) return;
    lines.push(`${title} :`, ...items.slice(0, limit).map((x) => `  - ${x}`));
    if (items.length > limit) lines.push(`  … ${items.length - limit} de plus`);
  };
  list('Specs sans aucun scénario lu (format attendu : « #### Scenario: <nom> »)', report.empty ?? []);
  list('Scénarios de même nom dans une capability (un seul identifiant pour les deux : renomme l\'un)', report.duplicates.map((d) =>
    `${d.id}${d.change ? ` (${d.change})` : ''} : ${d.requirements.map((r) => `« ${r ?? 'hors exigence'} »`).join(', ')}`));
  list('Scénarios sans test, toutes les tâches du change cochées', report.uncoveredChanges.map((s) => `${s.id} (${s.change})`));
  list('Scénarios sans test, tâches restantes (avertissement ; bloquant une fois toutes les tâches cochées)', report.pendingChanges.map((s) => `${s.id} (${s.change})`));
  if (report.coverage < report.min) list('Scénarios des specs sans test', report.uncoveredMain.map((s) => s.id));
  list('Tags @scenario orphelins', report.orphans.map((o) => `${o.id} → ${o.where.join(', ')}`));
  list('Tags @scenario hors fichier de test (ignorés : seul un test couvre un scénario)', report.outsideTests.map((o) => `${o.id} → ${o.where.join(', ')}`));
  return lines.join('\n');
}

const ADR_REF = /docs\/adr\/[^\s()[\]<>"'`]+?\.md/g;

// Règles des pistes, lues dans « tracks » du contrat (défauts : S, M, L de defaultConfig) :
// x-track obligatoire sur un change en cours ; spec → au moins une delta spec ; design → design.md ; adr → design.md cite un ADR.
// Tout ADR cité doit exister.
export function trackRules(config) {
  const rules = { ...defaultConfig().tracks };
  for (const [name, custom] of Object.entries(config?.tracks ?? {})) rules[name] = { ...rules[name], ...custom };
  return rules;
}

export function checkPolicy(root, config = {}) {
  const issues = [];
  const tracks = trackRules(config);
  const names = Object.keys(tracks).join(', ');
  for (const change of listChanges(root, { archived: true })) {
    const label = change.archived ? `archive/${change.name}` : change.name;
    const error = (detail) => issues.push({ level: 'error', label, detail });
    const track = readChangeMeta(change.dir)['x-track'];
    if (!track) {
      // Sans piste, aucune règle ne s'appliquerait : bloquant pour un change en cours.
      if (!change.archived) error(`piste non déclarée (x-track: ${names} dans .openspec.yaml)`);
      continue;
    }
    const rules = Object.hasOwn(tracks, track) ? tracks[track] : null;
    if (!rules) {
      error(`x-track invalide : ${track} (pistes : ${names})`);
      continue;
    }
    if (rules.spec && !change.archived && specFiles(path.join(change.dir, 'specs')).length === 0) {
      error(`piste ${track} : aucune delta spec (specs/<capability>/spec.md)`);
    }
    const design = readText(path.join(change.dir, 'design.md'));
    if (!design) {
      if (rules.design === 'required' || rules.adr === 'required') error(`piste ${track} : design.md manquant`);
      continue;
    }
    const adrs = [...new Set([...design.matchAll(ADR_REF)].map((m) => m[0]))];
    if (!adrs.length && rules.adr === 'required') error(`piste ${track} : design.md doit citer un ADR (docs/adr/…)`);
    for (const adr of adrs) {
      if (!fs.existsSync(path.join(root, adr))) error(`ADR introuvable : ${adr}`);
    }
  }
  return issues;
}

// Un change = une branche = un worktree, dossier frère du projet : le run d'un change n'est pas troublé par le cadrage
// du suivant (trace et pistes portent sur tous les changes en cours du dossier). Seulement après la porte de cadrage
// (x-validated). Le worktree part de HEAD ; le change et les ADR cités par son design.md, s'ils sont nouveaux (non
// suivis ou seulement indexés), y sont déplacés et commités. Un change déjà commité reste aussi dans le dossier
// principal (stayed: true). Retourne { target, branch, moved, stayed } ou { error }.
export function createWorktree(root, change, { target, branch = change } = {}) {
  const git = (args, cwd = root) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const rel = `openspec/changes/${change}`;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(change) || change === 'archive') return { error: `nom de change invalide : ${change}` };
  if (!fs.existsSync(path.join(root, rel))) return { error: `change introuvable : ${rel}` };
  if (!readChangeMeta(path.join(root, rel))['x-validated']) return { error: `${change} : cadrage non validé (x-validated absent de .openspec.yaml) : passe d'abord la porte de cadrage` };
  // Préfixe vide = racine du dépôt. Pas de comparaison de chemins : sous Windows, git rend le nom long (runneradmin)
  // d'un dossier que Node voit sous son nom court 8.3 (RUNNER~1).
  const prefix = git(['rev-parse', '--show-prefix']);
  if (prefix.status !== 0 || prefix.stdout.trim() !== '') return { error: 'le projet doit être la racine de son dépôt git' };
  if (git(['rev-parse', '--verify', '--quiet', 'HEAD']).status !== 0) return { error: 'aucun commit : le worktree part de HEAD' };
  for (const file of ['.harness/hx.mjs', CONFIG_PATH]) {
    if (git(['cat-file', '-e', `HEAD:${file}`]).status !== 0) return { error: `${file} n'est pas commité : le worktree part de HEAD` };
  }
  const dirty = git(['status', '--porcelain', '--untracked-files=no', '--', '.harness', '.claude', 'CLAUDE.md', 'openspec/config.yaml']).stdout.trim();
  if (dirty) return { error: `harness modifié et non commité (le worktree part de HEAD) :\n${dirty}` };
  const adrs = [...readText(path.join(root, rel, 'design.md')).matchAll(ADR_REF)].map((m) => m[0]);
  const paths = [...new Set([rel, ...adrs])].filter((p) => fs.existsSync(path.join(root, p)));
  const status = git(['status', '--porcelain', '-z', '--untracked-files=all', '--', ...paths]).stdout.split('\0').filter(Boolean);
  // Nouveaux : non suivis (??) ou ajoutés à l'index (A). Le reste modifie un fichier déjà commité.
  const isNew = (entry) => /^(\?\?|A[ MD]) /.test(entry);
  const changed = status.filter((entry) => !isNew(entry));
  if (changed.length) {
    return { error: `fichiers déjà commités et modifiés : commite-les d'abord (le change restera aussi dans le dossier principal) :\n${changed.join('\n')}` };
  }
  const staged = status.filter((entry) => entry.startsWith('A')).map((entry) => entry.slice(3));
  const untracked = status.filter((entry) => !entry.startsWith('AD')).map((entry) => entry.slice(3));
  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) return { error: `la branche ${branch} existe déjà` };
  const dest = path.resolve(target ?? path.join(path.dirname(root), `${path.basename(root)}-${change}`));
  if (fs.existsSync(dest)) return { error: `le dossier existe déjà : ${dest}` };
  const add = git(['worktree', 'add', '-q', '-b', branch, dest, 'HEAD']);
  if (add.status !== 0) return { error: `git worktree add a échoué : ${add.stderr.trim()}` };
  // Permissions accordées dans le dossier principal (« toujours autoriser ») : non suivies par git, donc absentes
  // du worktree. Sans elles, le run redemanderait chaque commande déjà accordée.
  const localSettings = path.join(root, LOCAL_SETTINGS);
  if (fs.existsSync(localSettings) && !fs.existsSync(path.join(dest, LOCAL_SETTINGS))) {
    fs.mkdirSync(path.dirname(path.join(dest, LOCAL_SETTINGS)), { recursive: true });
    fs.copyFileSync(localSettings, path.join(dest, LOCAL_SETTINGS));
  }
  const moved = untracked.length > 0;
  if (moved) {
    for (const p of untracked) {
      fs.mkdirSync(path.dirname(path.join(dest, p)), { recursive: true });
      fs.copyFileSync(path.join(root, p), path.join(dest, p));
    }
    const commit = git(['add', '--', ...untracked], dest).status === 0 && git(['commit', '-q', '-m', `${change} : proposition`], dest);
    if (!commit || commit.status !== 0) {
      return { error: `worktree créé (${dest}), mais le commit de la proposition a échoué : ${commit?.stderr?.trim() ?? 'git add'}. Le change reste aussi dans le dossier principal.` };
    }
    if (staged.length) git(['rm', '-q', '--cached', '--', ...staged]);
    for (const p of untracked) fs.rmSync(path.join(root, p), { force: true });
    if (!fs.readdirSync(path.join(root, rel), { recursive: true }).some((f) => fs.statSync(path.join(root, rel, f)).isFile())) {
      fs.rmSync(path.join(root, rel), { recursive: true, force: true });
    }
  }
  return { target: dest, branch, moved, stayed: fs.existsSync(path.join(root, rel)) };
}

export const RUN_REPORT = 'run-report.md';

// Verdict du rapport de fin de run écrit par hx-review, lu sur son titre « ## <change> : <verdict> ».
// null sans rapport ; « illisible » si le titre n'a pas ce format.
export function reportVerdict(dir) {
  const file = path.join(dir, RUN_REPORT);
  if (!fs.existsSync(file)) return null;
  return /^##\s+[^:\n]+?\s+:\s+(.+?)\s*$/m.exec(readText(file))?.[1] ?? 'illisible';
}

export function changeState(dir) {
  const meta = readChangeMeta(dir);
  const tasks = taskProgress(dir);
  const report = reportVerdict(dir);
  let stage = 'run en cours';
  if (!meta['x-validated']) stage = 'cadrage';
  else if (report) stage = `rapport : ${report}`;
  else if (tasks.done === 0) stage = 'validé, run à lancer';
  return { track: meta['x-track'] ?? null, validated: meta['x-validated'] ?? null, tasks, report, stage };
}

function realPath(p) {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

// Changes en cours de chaque worktree du dépôt, dossier principal compris : un run avance dans son worktree pendant
// que l'utilisateur cadre le change suivant ailleurs. Hors dépôt git : le seul dossier du projet.
export function worktreeStatus(root) {
  const listed = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const trees = listed.status !== 0 ? [{ path: root, branch: null }] : listed.stdout.split(/\r?\n\r?\n/).map((block) => {
    const tree = { path: null, branch: null };
    for (const line of block.split(/\r?\n/)) {
      const [key, ...value] = line.split(' ');
      if (key === 'worktree') tree.path = value.join(' ');
      else if (key === 'branch') tree.branch = value.join(' ').replace(/^refs\/heads\//, '');
      else if (key === 'bare') tree.bare = true;
    }
    return tree;
  }).filter((tree) => tree.path && !tree.bare && fs.existsSync(tree.path));
  const here = realPath(root);
  return trees.map(({ path: dir, branch }) => ({
    path: dir,
    branch,
    current: realPath(dir) === here,
    changes: listChanges(dir).map((change) => ({ name: change.name, ...changeState(change.dir) })),
  }));
}

export function formatStatus(trees) {
  return trees.flatMap((tree) => [
    `${tree.path}${tree.branch ? ` (${tree.branch})` : ''}${tree.current ? ' · ce dossier' : ''}`,
    ...(tree.changes.length ? tree.changes.map((c) => `  ${c.name} · piste ${c.track ?? '?'} · ${c.stage}${c.tasks.total ? ` · tâches ${c.tasks.done}/${c.tasks.total}` : ''}`) : ['  aucun change en cours']),
  ]).join('\n');
}

// Mesures de la revue d'élagage (docs/elagage.md), écrites dans .openspec.yaml par hx-triage (porte) et hx-review.
// Une clé absente veut dire « non mesuré » (étape non passée, ou change antérieur), jamais zéro.
export const METRICS = [
  { key: 'x-gate-corrections', label: 'Porte de cadrage, corrections demandées' },
  { key: 'x-gate-removed', label: 'Contre-relecture, décisions retirées ou simplifiées' },
  { key: 'x-review-confirmed', label: 'Revue, constats bloquants ou importants confirmés' },
  { key: 'x-review-discarded', label: 'Revue, constats écartés (faux positifs)' },
];

// Agrège les mesures des changes archivés (date de l'archive ≥ since, si donnée).
export function stats(root, { since } = {}) {
  const archived = listChanges(root, { archived: true })
    .filter((c) => c.archived && (!since || (/^\d{4}-\d{2}-\d{2}/.exec(c.name)?.[0] ?? '') >= since));
  const tracks = {};
  const metrics = Object.fromEntries(METRICS.map(({ key }) => [key, { total: 0, measured: 0, nonzero: 0 }]));
  const invalid = [];
  for (const change of archived) {
    const meta = readChangeMeta(change.dir);
    const track = meta['x-track'] ?? '?';
    tracks[track] = (tracks[track] ?? 0) + 1;
    for (const { key } of METRICS) {
      if (meta[key] === undefined) continue;
      if (!/^\d+$/.test(meta[key])) {
        invalid.push(`${change.name} : ${key}: ${meta[key]}`);
        continue;
      }
      const m = metrics[key];
      m.total += Number(meta[key]);
      m.measured += 1;
      if (Number(meta[key]) > 0) m.nonzero += 1;
    }
  }
  return { since: since ?? null, archived: archived.length, tracks, metrics, invalid };
}

export function formatStats(report) {
  const tracks = Object.entries(report.tracks).map(([t, n]) => `${t} ${n}`).join(' · ');
  const lines = [`${report.archived} change(s) archivé(s)${report.since ? ` depuis le ${report.since}` : ''}${tracks ? ` (${tracks})` : ''}`];
  for (const { key, label } of METRICS) {
    const m = report.metrics[key];
    lines.push(m.measured ? `  ${label} : ${m.total} · ${m.nonzero} change(s) concerné(s) sur ${m.measured} mesuré(s)` : `  ${label} : non mesuré`);
  }
  if (report.invalid.length) lines.push('Valeurs ignorées (entier attendu) :', ...report.invalid.map((x) => `  - ${x}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commandes CLI
// ---------------------------------------------------------------------------

export function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const [key, value] = arg.slice(2).split(/=(.*)/s);
    if (value !== undefined) out[key] = value;
    else if (VALUE_FLAGS.has(key)) out[key] = args[i + 1]?.startsWith('--') ? undefined : args[++i];
    else out[key] = true;
  }
  return out;
}

// Contrat valide, ou null après avoir expliqué pourquoi : rien ne s'exécute sur un contrat invalide.
function requireValidConfig(root, options) {
  const { config, errors } = loadValidConfig(root, options);
  if (!config && !errors.length) console.error(`hx : ${CONFIG_PATH} absent : lance /hx-setup ou « hx detect --write »`);
  else if (errors.length) console.error(`hx : contrat invalide (${CONFIG_PATH}) :\n${errors.map((e) => `  ✗ ${e}`).join('\n')}`);
  return errors.length ? null : config;
}

// Option à valeur donnée sans valeur (« --file » en dernier, ou suivie d'une autre option).
function missingValue(opts) {
  const flag = [...VALUE_FLAGS].find((key) => key in opts && opts[key] === undefined);
  if (flag) console.error(`hx : --${flag} attend une valeur`);
  return Boolean(flag);
}

function unknownComponent(config, name) {
  if (!isUnknownComponent(config, name)) return false;
  console.error(`hx : composant inconnu « ${name} » (connus : ${Object.keys(config.components ?? {}).join(', ') || 'aucun'})`);
  return true;
}

function cmdRun(root, args) {
  const opts = parseFlags(args);
  const name = opts._[0];
  if (missingValue(opts)) return 2;
  if (!name) {
    console.error('usage : hx run <commande> [--component <nom>] [--file <chemin>]');
    return 2;
  }
  const config = requireValidConfig(root, { structural: true });
  if (!config) return 1;
  if (unknownComponent(config, opts.component)) return 2;
  if (opts.file && opts.component) {
    console.error('hx : --file et --component sont exclusifs (le composant se déduit du fichier)');
    return 2;
  }
  const invocations = resolveInvocations(config, root, name, {
    component: opts.component,
    file: opts.file,
    fileOnly: Boolean(opts['file-only']),
  });
  if (invocations.length === 0) {
    // --file-only (hooks) : pas de variante rapide, rien à faire. Sinon, rien exécuté n'est pas un succès :
    // un test ciblé qui « passe » sans avoir tourné fausserait le rouge attendu par hx-tdd.
    if (opts.file && opts['file-only']) {
      console.error(`hx : pas de « ${name}-file » pour ${opts.file}, rien à exécuter`);
      return 0;
    }
    if (opts.file) {
      console.error(`hx : ${opts.file} n'appartient à aucun composant qui définit « ${name} » : rien exécuté`);
      return 3;
    }
    console.error(`hx : aucun composant ne définit « ${name} » (voir ${CONFIG_PATH})`);
    return 3;
  }
  let failed = 0;
  for (const inv of invocations) {
    console.error(`▶ ${name} · ${inv.component} : ${inv.command}`);
    if (!execute(inv.command, inv.cwd, { capture: false }).ok) failed += 1;
  }
  return failed ? 1 : 0;
}

function cmdCheck(root, args) {
  const opts = parseFlags(args);
  if (missingValue(opts)) return 2;
  const config = requireValidConfig(root);
  if (!config) return 1;
  if (unknownComponent(config, opts.component)) return 2;
  const results = [];
  if (fs.existsSync(path.join(root, 'openspec'))) {
    const validate = (label, args) => runStep({ label, component: '—', command: openspecCommand(root, args), cwd: root }, opts);
    results.push(validate('openspec', ['validate', '--all', '--strict', '--no-interactive']));
    if (!opts.fast) {
      results.push(validate('archives', ['validate', '--archived', '--no-interactive']));
      results.push(inProcessStep('pistes', () => {
        const issues = checkPolicy(root, config);
        const output = issues.map((i) => `${i.level === 'error' ? '✗' : '⚠'} ${i.label} : ${i.detail}`).join('\n');
        return { ok: !issues.some((i) => i.level === 'error'), output, notice: issues.length > 0 };
      }, opts));
      results.push(inProcessStep('trace', () => {
        const report = trace(root, config);
        return { ok: report.ok, output: formatTrace(report), notice: report.pendingChanges.length > 0 };
      }, opts));
    }
  } else {
    results.push({ label: 'openspec', component: '—', skipped: true, reason: 'dossier openspec/ absent' });
  }
  for (const step of opts.fast ? FAST_STEPS : CHECK_STEPS) {
    const invocations = resolveInvocations(config, root, step, { component: opts.component });
    // Pas de « vert » sans test exécuté : une étape test absente est un échec, pas un saut.
    if (invocations.length === 0 && step === 'test') {
      results.push({ label: step, component: opts.component ?? '—', ok: false, reason: 'non défini : aucun test exécuté' });
    } else if (invocations.length === 0) results.push({ label: step, component: '—', skipped: true, reason: 'non défini' });
    for (const inv of invocations) results.push(runStep({ label: step, ...inv }, opts));
  }
  const failed = results.filter((r) => !r.skipped && !r.ok).length;
  printResults(failed ? `hx check : ${failed} échec(s)` : 'hx check : tout est vert', results);
  return failed ? 1 : 0;
}

export function nodeVersionOk(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'];

// .claude/settings.json : JSON valide (un conflit de fusion le rend illisible, et Claude Code ignore alors les hooks)
// et chaque événement du harness câblé sur .harness/hooks.mjs.
export function checkSettings(root) {
  const file = path.join(root, '.claude', 'settings.json');
  if (!fs.existsSync(file)) return { level: 'warn', detail: '.claude/settings.json absent' };
  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { level: 'error', detail: `.claude/settings.json invalide, hooks inactifs : ${err.message}` };
  }
  const wired = (event) => (settings.hooks?.[event] ?? [])
    .some((group) => (group.hooks ?? []).some((h) => String(h.command ?? '').includes('.harness/hooks.mjs')));
  const missing = HOOK_EVENTS.filter((event) => !wired(event));
  return missing.length
    ? { level: 'warn', detail: `hooks non câblés : ${missing.join(', ')}` }
    : { level: 'ok', detail: '.claude/settings.json' };
}

const CONFLICT_MARKER = /^(<{7}|>{7})( |$)/m;

// Restes d'un `copier update` en conflit dans les fichiers du harness : marqueurs <<<<<<< / >>>>>>> ou fichiers .rej.
export function mergeLeftovers(root) {
  const files = ['CLAUDE.md', 'openspec/config.yaml', '.github/workflows/hx-check.yml']
    .flatMap((rel) => [rel, `${rel}.rej`])
    .map((rel) => path.join(root, rel))
    .filter((file) => fs.existsSync(file));
  for (const dir of ['.claude', '.harness']) {
    files.push(...walkFiles(path.join(root, dir), () => true, { skip: (name) => name === 'node_modules' }));
  }
  return files
    .filter((file) => file.endsWith('.rej') || CONFLICT_MARKER.test(readText(file)))
    .map((file) => toPosix(path.relative(root, file)));
}

// Version du template d'un projet (.copier-answers.yml) comparée au dernier tag de sa source.
export function readAnswers(root) {
  const answers = {};
  for (const line of readText(path.join(root, '.copier-answers.yml')).split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (m) answers[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return answers;
}

const parseVersion = (text) => /^v?(\d+)\.(\d+)\.(\d+)/.exec(text ?? '')?.slice(1).map(Number) ?? null;
const compareVersions = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function templateStatus(root, { timeout = 15000 } = {}) {
  const { _commit: commit, _src_path: src } = readAnswers(root);
  if (!src) return null;
  const url = src.replace(/^gh:/, 'https://github.com/');
  const r = spawnSync('git', ['ls-remote', '--tags', '--refs', url], { encoding: 'utf8', timeout });
  if (r.status !== 0) return { level: 'warn', detail: `dernière version inconnue (${src} injoignable)` };
  const tags = r.stdout.split('\n').map((l) => l.split('refs/tags/')[1]).filter((t) => parseVersion(t));
  if (!tags.length) return { level: 'warn', detail: `${src} n'a aucun tag de version : le projet suit sa branche par défaut` };
  const latest = tags.sort((a, b) => compareVersions(parseVersion(b), parseVersion(a)))[0];
  const current = parseVersion(commit);
  // copier enregistre « git describe » : v0.2.0-3-gabc1234 est postérieur à v0.2.0, donc au moins à jour à ce tag près.
  if (current && compareVersions(current, parseVersion(latest)) >= 0) return { level: 'ok', detail: `${commit} (dernière : ${latest})` };
  return { level: 'warn', detail: `${commit ?? 'version inconnue'}, dernière : ${latest} → uvx copier update --trust` };
}

function cmdDoctor(root, args) {
  const opts = parseFlags(args);
  const checks = [];
  const add = (level, label, detail = '') => checks.push({ level, label, detail });

  add(nodeVersionOk() ? 'ok' : 'error', 'Node', `${process.versions.node} (minimum ${MIN_NODE.join('.')})`);

  const { config, error } = loadConfig(root);
  let runnable = false;
  if (!config) add('error', 'Contrat', error === 'absent' ? `${CONFIG_PATH} absent : lance /hx-setup` : error);
  else {
    const issues = validateConfig(config, root);
    // Les commandes s'exécutent dès que le contrat est structurellement sain, même incomplet (pendant /hx-setup).
    runnable = !issues.some((i) => i.structural);
    if (!issues.some((i) => i.level === 'error')) add('ok', 'Contrat', `${components(config).length} composant(s)`);
    for (const i of issues) add(i.level, i.label, i.detail);
    if (!config.architecture?.profile?.size) add('warn', 'Architecture', 'profil non renseigné : lance /hx-setup');
  }

  const claude = readText(path.join(root, 'CLAUDE.md'));
  add(claude.includes('@.harness/project.md') ? 'ok' : 'warn', 'CLAUDE.md', claude ? 'importe .harness/project.md' : 'absent');
  const project = readText(path.join(root, '.harness', 'project.md'));
  if (!project) add('warn', 'Carte du projet', '.harness/project.md absent');
  else if (project.includes('hx:todo')) add('warn', 'Carte du projet', 'pas encore personnalisée : lance /hx-setup');
  else add('ok', 'Carte du projet', '.harness/project.md');

  const settings = checkSettings(root);
  add(settings.level, 'Hooks Claude Code', settings.detail);

  const conflicts = mergeLeftovers(root);
  if (conflicts.length) add('error', 'Fusion copier update', `conflits non résolus : ${conflicts.join(', ')}`);

  const tracked = ['.harness/hx.mjs', '.harness/hooks.mjs', CONFIG_PATH, '.harness/project.md', 'CLAUDE.md', '.claude/settings.json'];
  const ignored = spawnSync('git', ['check-ignore', ...tracked], { cwd: root, encoding: 'utf8' });
  if (ignored.status === 0) add('error', 'Git', `fichiers ignorés par .gitignore : ${ignored.stdout.trim().split('\n').join(', ')}`);

  const pinned = readVersions(root).openspec;
  add(fs.existsSync(path.join(root, 'openspec', 'config.yaml')) ? 'ok' : 'error', 'OpenSpec', 'openspec/config.yaml');
  try {
    pinnedOpenspec(root);
  } catch (err) {
    add('error', 'OpenSpec', err.message);
  }
  if (!opts['no-run']) {
    const template = templateStatus(root);
    if (template) add(template.level, 'Template Harness', template.detail);
    const installed = installedOpenspecVersion();
    if (!installed) add('warn', 'CLI openspec', `absente du PATH (requise par /opsx:*) : npm i -g @fission-ai/openspec@${pinned}`);
    else if (pinned && installed !== pinned) add('warn', 'CLI openspec', `${installed} installée, ${pinned} épinglée`);
    else add('ok', 'CLI openspec', installed);
  }

  if (runnable && !opts['no-run']) {
    for (const step of DOCTOR_STEPS) {
      for (const inv of resolveInvocations(config, root, step)) {
        const r = execute(inv.command, inv.cwd, { capture: true });
        add(r.ok ? 'ok' : 'error', `${step} · ${inv.component}`, r.ok ? fmtMs(r.ms) : `échec : ${inv.command}\n${tail(r.output, 20)}`);
      }
    }
  }

  const icons = { ok: '✓', warn: '⚠', error: '✗' };
  console.log('hx doctor');
  for (const c of checks) console.log(`  ${icons[c.level]} ${c.label}${c.detail ? ` : ${c.detail.replace(/\n/g, '\n      ')}` : ''}`);
  const errors = checks.filter((c) => c.level === 'error').length;
  const warnings = checks.filter((c) => c.level === 'warn').length;
  console.log(`\n${errors} erreur(s), ${warnings} avertissement(s)`);
  return errors ? 1 : 0;
}

function cmdDetect(root, args) {
  const opts = parseFlags(args);
  const result = detect(root);
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('Composants détectés :');
    for (const [name, c] of Object.entries(result.components)) {
      console.log(`  ${name}  (${c.stack}, ${c.path})`);
      for (const [cmd, line] of Object.entries(c.commands)) console.log(`    ${cmd.padEnd(10)} ${line}`);
    }
    const { files, loc, sizeHint } = result.stats;
    console.log(`\nTaille : ${loc} lignes dans ${files} fichiers source → ${sizeHint} (indicatif)`);
    if (result.notes.length) console.log(`\nRemarques :\n${result.notes.map((n) => `  - ${n}`).join('\n')}`);
  }
  if (!opts.write) return 0;
  const { config, error } = loadConfig(root);
  if (error && error !== 'absent') {
    console.error(`hx : ${error}`);
    return 1;
  }
  const base = config ?? defaultConfig();
  if (Object.keys(base.components ?? {}).length && !opts.force) {
    console.error(`hx : ${CONFIG_PATH} contient déjà des composants (--force pour les remplacer)`);
    return 1;
  }
  console.error(`hx : écrit ${path.relative(process.cwd(), writeConfig(root, { ...base, components: result.components }))}`);
  return 0;
}

function cmdTrace(root, args) {
  const opts = parseFlags(args);
  const report = trace(root, loadConfig(root).config ?? {});
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else {
    const pending = report.pendingChanges.length;
    const verdict = !report.ok ? '✗ traçabilité incomplète' : pending ? `✓ aucun échec (${pending} scénario(s) de change encore sans test)` : '✓ traçabilité complète';
    console.log(`hx trace\n${formatTrace(report)}\n\n${verdict}`);
  }
  return report.ok ? 0 : 1;
}

function cmdMigrate(root) {
  const { config, error } = loadConfig(root);
  if (!config) {
    if (error === 'absent') return 0; // rien à migrer : /hx-setup créera le contrat
    console.error(`hx : ${error}`);
    return 1;
  }
  const { config: migrated, added } = migrateConfig(config);
  if (!added.length) {
    console.log('hx migrate : contrat à jour');
    return 0;
  }
  writeConfig(root, migrated);
  console.log(`hx migrate : clés ajoutées à ${CONFIG_PATH} : ${added.join(', ')}`);
  return 0;
}

function cmdWorktree(root, args) {
  const opts = parseFlags(args);
  if (missingValue(opts)) return 2;
  const change = opts._[0];
  if (!change) {
    console.error('usage : hx worktree <change> [--path <dossier>] [--branch <nom>]');
    return 2;
  }
  const result = createWorktree(root, change, { target: opts.path, branch: opts.branch });
  if (result.error) {
    console.error(`hx : ${result.error}`);
    return 1;
  }
  console.log([
    `Worktree prêt : ${result.target} (branche ${result.branch})${result.moved ? ` ; change déplacé et commité : « ${change} : proposition »` : ''}.`,
    ...(result.stayed ? [`⚠ ${change} était déjà commité : il reste aussi dans ce dossier, dont hx check restera rouge sur ses scénarios tant qu'il n'est pas mergé.`] : []),
    ...(fs.existsSync(path.join(result.target, LOCAL_SETTINGS)) ? [`Permissions locales (${LOCAL_SETTINGS}) reprises dans le worktree.`] : []),
    'Lancer le run en mode Auto (pas de confirmation par commande ; les chemins protégés et git push restent confirmés) :',
    `  Claude Code Desktop : nouvelle session sur le dossier ${result.target}, mode Auto (Cmd/Ctrl+Shift+M), puis /hx-implement ${change}`,
    `  Terminal : cd ${shellQuote(result.target)} && claude --permission-mode auto "/hx-implement ${change}"`,
    `Après le merge : git worktree remove ${shellQuote(result.target)}`,
  ].join('\n'));
  return 0;
}

function cmdStatus(root, args) {
  const trees = worktreeStatus(root);
  if (parseFlags(args).json) console.log(JSON.stringify(trees, null, 2));
  else console.log(`hx status\n${formatStatus(trees)}`);
  return 0;
}

function cmdStats(root, args) {
  const opts = parseFlags(args);
  if (missingValue(opts)) return 2;
  if (opts.since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
    console.error('hx : --since attend une date AAAA-MM-JJ');
    return 2;
  }
  const report = stats(root, { since: opts.since });
  if (opts.json) console.log(JSON.stringify(report, null, 2));
  else console.log(`hx stats\n${formatStats(report)}`);
  return 0;
}

function cmdOpenspec(root, args) {
  return execute(openspecCommand(root, args), root, { capture: false }).code;
}

const HELP = `hx : contrat de commandes du harness

  hx run <commande> [--component <nom>] [--file <chemin> [--file-only]]
                      exécute une commande du contrat (.harness/config.json)
  hx check [--fast] [--component <nom>] [--verbose]
                      openspec (validate, archives) + pistes + trace + lint + typecheck + arch + test
                      --fast : openspec validate + lint + typecheck
  hx trace [--json]   scénarios OpenSpec ↔ tests tagués « @scenario <capability>/<scénario> »
  hx doctor [--no-run]
                      vérifie l'installation et exécute chaque commande
  hx detect [--json] [--write [--force]]
                      propose les composants à partir des manifestes
  hx worktree <change> [--path <dossier>] [--branch <nom>]
                      branche + worktree frère pour le run d'un change validé (y déplace et commite le change s'il est nouveau)
  hx status [--json]  changes en cours de chaque worktree : piste, étape (cadrage, run, rapport), tâches
  hx stats [--since AAAA-MM-JJ] [--json]
                      mesures d'élagage des changes archivés (porte, contre-relecture, revue)
  hx migrate          complète .harness/config.json avec les clés ajoutées par le template
  hx openspec <args>  appelle la version épinglée d'OpenSpec

Codes de sortie : 0 succès · 1 échec · 2 usage · 3 commande non définie (ou --file hors de tout composant qui la définit)`;

export function main(argv = process.argv.slice(2), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'run': return cmdRun(root, rest);
    case 'check': return cmdCheck(root, rest);
    case 'doctor': return cmdDoctor(root, rest);
    case 'detect': return cmdDetect(root, rest);
    case 'trace': return cmdTrace(root, rest);
    case 'migrate': return cmdMigrate(root);
    case 'worktree': return cmdWorktree(root, rest);
    case 'status': return cmdStatus(root, rest);
    case 'stats': return cmdStats(root, rest);
    case 'openspec': return cmdOpenspec(root, rest);
    case undefined: case 'help': case '--help': case '-h':
      console.log(HELP);
      return 0;
    default:
      console.error(`hx : commande inconnue « ${command} »\n\n${HELP}`);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(`hx : ${err.message}`);
    process.exitCode = 1;
  }
}
