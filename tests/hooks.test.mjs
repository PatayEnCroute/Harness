import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooks = path.resolve(here, '..', 'template', '.harness', 'hooks.mjs');

function project(config, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-hooks-'));
  const all = { '.harness/config.json': JSON.stringify(config), ...files };
  for (const [rel, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

// Lance le hook comme Claude Code : JSON sur stdin, CLAUDE_PROJECT_DIR dans l'environnement.
function hook(event, root, input = {}, env = {}) {
  const r = spawnSync(process.execPath, [hooks, event], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_CODE_REMOTE: '', ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const ok = 'node -e "process.exit(0)"';
const ko = 'node -e "console.error(\'lint KO\'); process.exit(1)"';

describe('hooks Claude Code', () => {
  test('pre-tool-use : demande confirmation pour openspec/specs, silence ailleurs', () => {
    const root = project({ components: {} });
    const asked = hook('pre-tool-use', root, { tool_input: { file_path: path.join(root, 'openspec/specs/calc/spec.md') } });
    assert.equal(asked.code, 0);
    assert.equal(JSON.parse(asked.stdout).hookSpecificOutput.permissionDecision, 'ask');
    const free = hook('pre-tool-use', root, { tool_input: { file_path: path.join(root, 'src/a.js') } });
    assert.equal(free.stdout, '');
  });

  test('post-tool-use : lint-file en échec → code 2 avec la sortie ; sans lint-file → rien', () => {
    const withFile = project({ components: { app: { path: '.', commands: { lint: ok, 'lint-file': `${ko} {file}` } } } });
    const r = hook('post-tool-use', withFile, { tool_input: { file_path: path.join(withFile, 'src/a.js') } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /lint KO/);
    const without = project({ components: { app: { path: '.', commands: { lint: ko } } } });
    assert.equal(hook('post-tool-use', without, { tool_input: { file_path: path.join(without, 'src/a.js') } }).code, 0);
  });

  test('stop : contrôles rapides sur du code modifié, jamais deux fois de suite', () => {
    const root = project({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'src/a.js': 'x\n' });
    spawnSync('git', ['init', '-q'], { cwd: root });
    const r = hook('stop', root, {});
    assert.equal(r.code, 2);
    assert.match(r.stderr, /contrôles rapides/);
    assert.equal(hook('stop', root, { stop_hook_active: true }).code, 0);
  });

  test('stop : projet installé dans un sous-dossier du dépôt git', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-mono-'));
    spawnSync('git', ['init', '-q'], { cwd: repo });
    const root = path.join(repo, 'apps', 'web');
    fs.mkdirSync(path.join(root, '.harness'), { recursive: true });
    fs.writeFileSync(path.join(root, '.harness/config.json'), JSON.stringify({ components: { web: { path: 'src', commands: { lint: ko } } } }));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/a.js'), 'x\n');
    assert.equal(hook('stop', root, {}).code, 2);
  });

  test('stop : seuls des fichiers non-code modifiés → rien', () => {
    const root = project({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'docs/notes.md': 'x\n' });
    spawnSync('git', ['init', '-q'], { cwd: root });
    assert.equal(hook('stop', root, {}).code, 0);
  });

  test('session-start : changes en cours et projet à personnaliser', () => {
    const root = project({ components: {} }, {
      '.harness/project.md': '<!-- hx:todo -->\n',
      'openspec/changes/add-mult/.openspec.yaml': 'schema: spec-driven\nx-track: M\n',
      'openspec/changes/add-mult/tasks.md': '## 1\n- [x] 1.1 a\n- [ ] 1.2 b\n',
    });
    const r = hook('session-start', root);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /\/hx-setup/);
    assert.match(r.stdout, /add-mult \(piste M, 1\/2 tâches\)/);
  });

  test('événement inconnu ou entrée invalide : jamais bloquant', () => {
    const root = project({ components: {} });
    assert.equal(hook('nope', root).code, 0);
    const r = spawnSync(process.execPath, [hooks, 'post-tool-use'], { input: 'pas du json', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    assert.equal(r.status, 0);
  });
});
