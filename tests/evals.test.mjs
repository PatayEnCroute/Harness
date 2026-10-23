import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Les graders des evals sont eux-mêmes testés : un faux succès fausse toute la mesure (docs/elagage.md).
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '..', 'evals', 'lib');
const hx = path.resolve(here, '..', 'template', '.harness', 'hx.mjs');

// Transcript stream-json minimal : appels d'outils de l'assistant et leurs résultats.
function transcript(steps) {
  const lines = [];
  steps.forEach((step, i) => {
    const id = `t${i}`;
    lines.push(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: step.tool, input: step.input }] } }));
    if (step.result !== undefined) {
      lines.push(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: Boolean(step.error), content: step.result }] } }));
    }
  });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-evals-')), 'transcript.jsonl');
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

const testFirst = (file) => spawnSync(process.execPath, [path.join(lib, 'test-first.mjs'), file, 'src/mult\\.js', '(^|/)test/'], { encoding: 'utf8' });
const writeTest = { tool: 'Write', input: { file_path: '/p/test/mult.test.js' } };
const writeCode = { tool: 'Write', input: { file_path: '/p/src/mult.js' } };
const run = (result, error = false) => ({ tool: 'Bash', input: { command: 'node .harness/hx.mjs run test --file test/mult.test.js' }, result, error });

describe('evals : test-first.mjs', () => {
  test('test, rouge, code, vert : réussi', () => {
    const r = testFirst(transcript([writeTest, run('Exit code 1\nnot ok 1 - mult', true), writeCode, run('# pass 1\n# fail 0')]));
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('test puis squelette du code, rouge, puis vrai code : réussi', () => {
    const r = testFirst(transcript([writeTest, writeCode, run('not ok 1 - mult\n# fail 1'), { ...writeCode }, run('# fail 0')]));
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('code avant le test : échec', () => {
    const r = testFirst(transcript([writeCode, writeTest, run('not ok 1', true), run('# fail 0')]));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /code est écrit avant le test/);
  });

  test('aucun rouge vu avant le premier vert : échec', () => {
    const r = testFirst(transcript([writeTest, writeCode, run('# pass 2\n# fail 0')]));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /au rouge avant le premier vert/);
  });

  test('un rouge masqué par « | tail » se lit dans la sortie', () => {
    const piped = { tool: 'Bash', input: { command: 'npm test 2>&1 | tail -5' }, result: '# tests 1\n# fail 1' };
    const r = testFirst(transcript([writeTest, piped, writeCode, run('# fail 0')]));
    assert.equal(r.status, 0, r.stdout + r.stderr);
  });

  test('un lancement avant toute écriture de test ne compte pas comme rouge', () => {
    const r = testFirst(transcript([run('not ok 1', true), writeTest, writeCode, run('# fail 0')]));
    assert.equal(r.status, 1);
  });
});

// Projet de démo : hx.mjs du template, un composant node dont les tests passent par node --test.
function demo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-grade-'));
  const files = {
    '.harness/config.json': JSON.stringify({ components: { app: { path: '.', commands: { test: 'node --test', 'test-file': 'node --test {file}' } } } }),
    'package.json': '{ "type": "module" }',
    'src/mult.js': 'export const mult = (a, b) => a * b;',
    'test/two.test.js': "// @scenario calc/two\nimport { test } from 'node:test'; import assert from 'node:assert'; import { mult } from '../src/mult.js';\ntest('2x3', () => assert.equal(mult(2, 3), 6));",
    'openspec/changes/add-mult/design.md': 'Le test « @scenario calc/zero » couvre le cas nul.\n',
    'test/zero.test.js': "// @scenario calc/zero\nimport { test } from 'node:test'; import assert from 'node:assert'; import { mult } from '../src/mult.js';\ntest('7x0', () => assert.equal(mult(7, 0), 0));",
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  fs.copyFileSync(hx, path.join(root, '.harness', 'hx.mjs'));
  const git = (...args) => spawnSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=e', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'état initial');
  return { root, git, sha: git('rev-parse', 'HEAD').stdout.trim() };
}

// Exécute un extrait de grade.sh dans le projet, avec les aides sourcées.
// NODE_TEST_CONTEXT retiré : sinon le « node --test » du projet se croit enfant de ce runner et sort toujours en 0.
function grade(root, script, env = {}) {
  const { NODE_TEST_CONTEXT, ...base } = process.env;
  return spawnSync('bash', ['-c', `set -e; source "${path.join(lib, 'grade.sh')}"; ${script}`], { cwd: root, encoding: 'utf8', env: { ...base, ...env } });
}

// Ce que fait /opsx:archive dans le projet de démo : le change part dans openspec/changes/archive/, puis commit.
function archiveChange(root, git) {
  fs.mkdirSync(path.join(root, 'openspec/changes/archive'), { recursive: true });
  fs.renameSync(path.join(root, 'openspec/changes/add-mult'), path.join(root, 'openspec/changes/archive/2026-10-20-add-mult'));
  git('add', '-A');
  git('commit', '-qm', 'add-mult : archive OpenSpec');
}

const BASH = spawnSync('bash', ['--version']).status === 0 && process.platform !== 'win32';

describe('evals : aides de grade.sh', { skip: !BASH && 'bash indisponible' }, () => {
  test('only_changed compare au commit initial : un commit de l\'agent ne cache rien', () => {
    const { root, git, sha } = demo();
    fs.writeFileSync(path.join(root, 'src/mult.js'), 'export const mult = () => 0;');
    git('commit', '-qam', 'agent');
    const r = grade(root, "only_changed '^(docs/|openspec/changes/)'", { INITIAL_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /src\/mult\.js/);
    assert.equal(grade(root, "only_changed '^(src/)'", { INITIAL_SHA: sha }).status, 0);
  });

  test('mutant_caught_by : seul le test du scénario visé compte', () => {
    const { root } = demo();
    const wrongForZero = "'export const mult = (a, b) => (b === 0 ? NaN : a * b);'";
    assert.equal(grade(root, `mutant_caught_by calc/zero src/mult.js ${wrongForZero}`).status, 0);
    const r = grade(root, `mutant_caught_by calc/two src/mult.js ${wrongForZero}`);
    assert.equal(r.status, 1, 'le test de calc/two ne voit pas une erreur sur zéro');
    assert.match(r.stderr, /aucun test tagué @scenario calc\/two/);
    assert.equal(fs.readFileSync(path.join(root, 'src/mult.js'), 'utf8'), 'export const mult = (a, b) => a * b;', 'fichier restauré');
  });

  test('no_permission_denials : un appel refusé fait échouer le run, avec la commande', () => {
    const { root } = demo();
    const withResult = (result) => {
      const file = transcript([run('# fail 0')]);
      fs.appendFileSync(file, `${JSON.stringify({ type: 'result', ...result })}\n`);
      return file;
    };
    assert.equal(grade(root, 'no_permission_denials', { TRANSCRIPT: withResult({ permission_denials: [] }) }).status, 0);
    const denied = { permission_denials: [{ tool_name: 'Bash', tool_use_id: 'x', tool_input: { command: 'git worktree list' } }, { tool_name: 'WebFetch', tool_use_id: 'y', tool_input: {} }] };
    const r = grade(root, 'no_permission_denials', { TRANSCRIPT: withResult(denied) });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /2 appel\(s\) refusé\(s\).*Bash\(git worktree list\) ; WebFetch/);
  });

  test('no_permission_denials : un refus au premier tour compte aussi (scénario à plusieurs tours)', () => {
    const { root } = demo();
    const file = transcript([run('# fail 0')]);
    const denied = { tool_name: 'Bash', tool_use_id: 'x', tool_input: { command: 'git push -u origin main' } };
    fs.appendFileSync(file, `${JSON.stringify({ type: 'result', permission_denials: [denied] })}\n${JSON.stringify({ type: 'result', permission_denials: [] })}\n`);
    const r = grade(root, 'no_permission_denials', { TRANSCRIPT: file });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Bash\(git push -u origin main\)/);
  });

  test('archive_is_last : archive en dernier commit, sans réécriture ; un correctif après l\'archive échoue', () => {
    const { root, git, sha } = demo();
    fs.writeFileSync(path.join(root, 'src/mult.js'), '/** Produit de a et b. */\nexport const mult = (a, b) => a * b;');
    git('commit', '-qam', 'mineur');
    archiveChange(root, git);
    assert.equal(grade(root, 'archive_is_last add-mult', { INITIAL_SHA: sha }).status, 0);

    fs.appendFileSync(path.join(root, 'src/mult.js'), '\n');
    git('commit', '-qam', 'mineur après coup');
    let r = grade(root, 'archive_is_last add-mult', { INITIAL_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /dernier commit n'est pas l'archive de add-mult : mineur après coup/);

    // Remettre l'archive en dernier par rebase : historique réécrit, échec.
    git('reset', '-q', '--hard', 'HEAD~2');
    fs.appendFileSync(path.join(root, 'src/mult.js'), '\n');
    git('commit', '-qam', 'mineur après coup');
    archiveChange(root, git);
    r = grade(root, 'archive_is_last add-mult', { INITIAL_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /historique réécrit/);
  });

  test('archive_is_last : revert de l\'archive, correctif, nouvelle archive : réussi', () => {
    const { root, git, sha } = demo();
    archiveChange(root, git);
    git('revert', '--no-edit', 'HEAD');
    fs.appendFileSync(path.join(root, 'src/mult.js'), '\n');
    git('commit', '-qam', 'correctif CI');
    archiveChange(root, git);
    const r = grade(root, 'archive_is_last add-mult', { INITIAL_SHA: sha });
    assert.equal(r.status, 0, r.stderr);
  });

  test('archive_is_last : rien de commité, ou commit d\'archive qui embarque du code, ou change non archivé : échec', () => {
    const { root, git, sha } = demo();
    let r = grade(root, 'archive_is_last add-mult', { INITIAL_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /aucun commit depuis l'état initial/);
    fs.appendFileSync(path.join(root, 'src/mult.js'), '\n');
    archiveChange(root, git);
    r = grade(root, 'archive_is_last add-mult', { INITIAL_SHA: sha });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /le commit d'archive touche aussi : src\/mult\.js/);
  });

  test('gate_held : change proposé et arrêté à la porte ; validé, codé, branché ou sans spec : échec', () => {
    const propose = (root, meta = 'x-track: M\n') => {
      fs.rmSync(path.join(root, 'openspec/changes/add-mult'), { recursive: true });
      fs.mkdirSync(path.join(root, 'openspec/changes/sum-guard/specs/calc'), { recursive: true });
      fs.writeFileSync(path.join(root, 'openspec/changes/sum-guard/.openspec.yaml'), `schema: spec-driven\n${meta}`);
      fs.writeFileSync(path.join(root, 'openspec/changes/sum-guard/specs/calc/spec.md'), '## MODIFIED Requirements\n');
    };
    let { root, git, sha } = demo();
    propose(root);
    assert.equal(grade(root, 'gate_held', { INITIAL_SHA: sha }).status, 0);
    git('branch', 'sum-guard');
    assert.match(grade(root, 'gate_held', { INITIAL_SHA: sha }).stderr, /branche créée avant la validation/);

    ({ root, sha } = demo());
    propose(root, 'x-track: M\nx-validated: 2026-10-23\n');
    assert.match(grade(root, 'gate_held', { INITIAL_SHA: sha }).stderr, /x-validated posé sans validation/);

    ({ root, sha } = demo());
    propose(root, 'x-track: S\n');
    assert.match(grade(root, 'gate_held', { INITIAL_SHA: sha }).stderr, /piste M ou L non déclarée/);

    ({ root, sha } = demo());
    propose(root);
    fs.writeFileSync(path.join(root, 'src/mult.js'), 'export const mult = () => 0;');
    assert.match(grade(root, 'gate_held', { INITIAL_SHA: sha }).stderr, /fichiers modifiés hors de .*src\/mult\.js/);

    ({ root, sha } = demo());
    fs.rmSync(path.join(root, 'openspec/changes/add-mult'), { recursive: true });
    assert.match(grade(root, 'gate_held', { INITIAL_SHA: sha }).stderr, /aucun change OpenSpec proposé/);
  });

  test('mutant invalide ou tests déjà rouges : la notation échoue au lieu de compter un faux « détecté »', () => {
    const { root } = demo();
    let r = grade(root, "mutant_caught src/mult.js 'export const nope = ('");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /mutant invalide/);
    fs.writeFileSync(path.join(root, 'src/mult.js'), 'export const mult = () => NaN;');
    r = grade(root, "mutant_caught src/mult.js 'export const mult = () => 1;'");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /échouent déjà sans mutant/);
  });
});
