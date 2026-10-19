// Contrat avec OpenSpec : chaque hypothèse du harness sur la version épinglée est vérifiée ici.
// À relancer à chaque montée de version (openspec_version dans copier.yml).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectScenarios, listChanges, readChangeMeta, taskProgress } from '../template/.harness/hx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pinned = /openspec_version:[\s\S]*?default:\s*"([^"]+)"/.exec(fs.readFileSync(path.join(here, '..', 'copier.yml'), 'utf8'))[1];
const env = { ...process.env, OPENSPEC_TELEMETRY: '0' };
const installed = spawnSync('openspec --version', { shell: true, encoding: 'utf8', env });
const cli = installed.status === 0 && installed.stdout.trim() === pinned ? 'openspec' : `npx -y @fission-ai/openspec@${pinned}`;

let root;
const openspec = (args) => spawnSync(`${cli} ${args}`, { cwd: root, shell: true, encoding: 'utf8', env });
const json = (args) => {
  const r = openspec(args);
  assert.equal(r.status, 0, `${args}\n${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
};
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};
const change = 'openspec/changes/add-mult';

describe(`contrat OpenSpec ${pinned}`, () => {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-contract-'));
    write('openspec/config.yaml', 'schema: spec-driven\ncontext: |\n  HX_MARKER\n');
  });

  test('init --tools claude : non interactif, conserve config.yaml, installe les skills /opsx', () => {
    const r = openspec('init --tools claude .');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(fs.readFileSync(path.join(root, 'openspec/config.yaml'), 'utf8'), /HX_MARKER/);
    for (const skill of ['openspec-propose', 'openspec-apply-change', 'openspec-archive-change']) {
      assert.ok(fs.existsSync(path.join(root, '.claude/skills', skill, 'SKILL.md')), skill);
    }
  });

  test('chaque commande /opsx:* citée par le template existe dans cette version', () => {
    const template = path.join(here, '..', 'template');
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const cited = new Set(walk(template).filter((f) => /\.(md|ya?ml|jinja)$/.test(f))
      .flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/\/opsx:([a-z-]+)/g)].map((m) => m[1])));
    assert.ok(cited.size > 0);
    const missing = [...cited].filter((name) => !fs.existsSync(path.join(root, '.claude/commands/opsx', `${name}.md`)));
    assert.deepEqual(missing, []);
  });

  test('new change : .openspec.yaml plat, x-track et x-validated acceptés par validate --strict', () => {
    assert.equal(openspec('new change add-mult').status, 0);
    fs.appendFileSync(path.join(root, change, '.openspec.yaml'), 'x-track: M\nx-validated: 2026-10-18\n');
    assert.equal(readChangeMeta(path.join(root, change))['x-track'], 'M');
    assert.equal(readChangeMeta(path.join(root, change))['x-validated'], '2026-10-18');
    write(`${change}/proposal.md`, '## Why\nNeed multiplication for invoice totals in the app.\n\n## What Changes\n- Add multiplication\n\n## Capabilities\n\n### New Capabilities\n- `calc`: arithmetic\n\n### Modified Capabilities\n\n## Impact\nNone\n');
    write(`${change}/specs/calc/spec.md`, '## Purpose\nArithmetic operations used to compute invoice lines and totals.\n\n## ADDED Requirements\n\n### Requirement: Multiplication\nThe system SHALL multiply two integers.\n\n#### Scenario: Multiply two numbers\n- **WHEN** multiplying 2 and 3\n- **THEN** the result is 6\n');
    write(`${change}/tasks.md`, '## 1. Multiplication\n\n- [x] 1.1 Write the test\n- [ ] 1.2 Implement\n');
    const report = json('validate --all --strict --json --no-interactive');
    assert.equal(report.summary.totals.failed, 0);
  });

  test('list --json : progression identique à celle lue par le harness', () => {
    const listed = json('list --json').changes.find((c) => c.name === 'add-mult');
    const ours = taskProgress(path.join(root, change));
    assert.deepEqual([listed.completedTasks, listed.totalTasks], [ours.done, ours.total]);
    assert.deepEqual(listChanges(root).map((c) => c.name), ['add-mult']);
  });

  test('instructions apply --json : tâches lisibles, « ready » sans design.md (piste M)', () => {
    const { tasks, state, missingArtifacts = [] } = json('instructions apply --change add-mult --json');
    assert.deepEqual(tasks.map((t) => [t.description, t.done]), [['1.1 Write the test', true], ['1.2 Implement', false]]);
    assert.equal(state, 'ready');
    assert.deepEqual(missingArtifacts, []);
  });

  test('scénarios du delta vus par la trace avant l\'archive', () => {
    assert.deepEqual(collectScenarios(root).changes.map((s) => s.id), ['calc/multiply-two-numbers']);
  });

  test('archive -y : spec principale créée avec son Purpose, même identifiant de scénario, archives valides', () => {
    write(`${change}/tasks.md`, '## 1. Multiplication\n\n- [x] 1.1 Write the test\n- [x] 1.2 Implement\n');
    const r = openspec('archive add-mult -y');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const spec = fs.readFileSync(path.join(root, 'openspec/specs/calc/spec.md'), 'utf8');
    assert.match(spec, /Arithmetic operations used to compute invoice lines and totals/);
    const { main, changes } = collectScenarios(root);
    assert.deepEqual(main.map((s) => s.id), ['calc/multiply-two-numbers']);
    assert.deepEqual(changes, []);
    assert.equal(json('validate --all --strict --json --no-interactive').summary.totals.failed, 0);
    assert.equal(openspec('validate --archived --no-interactive').status, 0);
    assert.equal(readChangeMeta(listChanges(root, { archived: true })[0].dir)['x-track'], 'M');
  });
});
