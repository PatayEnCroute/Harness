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
