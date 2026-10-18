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
  const asks = (r) => r.stdout !== '' && JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'ask';

  test('pre-tool-use : confirmation pour openspec/specs, silence ailleurs', () => {
    const root = project({ components: {} });
    assert.ok(asks(hook('pre-tool-use', root, { tool_input: { file_path: path.join(root, 'openspec/specs/calc/spec.md') } })));
    const free = hook('pre-tool-use', root, { tool_input: { file_path: path.join(root, 'src/a.js') } });
    assert.equal(free.code, 0);
    assert.equal(free.stdout, '');
    const outside = path.join(path.dirname(root), 'ailleurs', 'openspec', 'specs', 'x', 'spec.md');
    assert.equal(hook('pre-tool-use', root, { tool_input: { file_path: outside } }).stdout, '');
  });

  test('pre-tool-use : confirmation pour le contrat, les hooks et les permissions', () => {
    const root = project({ components: {} });
    for (const rel of ['.harness/config.json', '.harness/hx.mjs', '.harness/hooks.mjs', '.claude/settings.json', '.claude/settings.local.json']) {
      assert.ok(asks(hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: path.join(root, rel) } })), rel);
    }
    assert.equal(hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: path.join(root, '.harness/project.md') } }).stdout, '');
  });

  test('pre-tool-use : HX_ALLOW_CONFIG_EDITS=1 lève la confirmation sur config.json seulement', () => {
    const root = project({ components: {} });
    const edit = (rel) => hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: path.join(root, rel) } }, { HX_ALLOW_CONFIG_EDITS: '1' });
    assert.equal(edit('.harness/config.json').stdout, '');
    assert.equal(hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command: `echo '{}' > .harness/config.json` } }, { HX_ALLOW_CONFIG_EDITS: '1' }).stdout, '');
    for (const rel of ['.harness/hooks.mjs', '.harness/hx.mjs', '.claude/settings.json', 'openspec/specs/x/spec.md']) assert.ok(asks(edit(rel)), rel);
    // Commande vue dans l'eval setup : lancer hx.mjs ne l'écrit pas, seul config.json est écrit.
    const setupCommand = `node .harness/hx.mjs detect --write && python3 -c "open('.harness/config.json','w')"`;
    assert.equal(hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command: setupCommand } }, { HX_ALLOW_CONFIG_EDITS: '1' }).stdout, '');
    assert.ok(asks(hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command: setupCommand } })), 'sans la variable, confirmation');
  });

  test('pre-tool-use : une commande Bash qui écrit un fichier protégé demande confirmation, une lecture non', () => {
    const root = project({ components: {} });
    const bash = (command) => hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command } });
    assert.ok(asks(bash(`echo '{}' > .harness/config.json`)));
    assert.ok(asks(bash('sed -i s/a/b/ .claude/settings.json')));
    assert.ok(asks(bash('cat x > openspec/specs/calc/spec.md')));
    assert.equal(bash('cat .harness/config.json').stdout, '');
    assert.equal(bash('grep -i test .harness/config.json').stdout, '');
    assert.ok(asks(bash('perl -pi -e s/a/b/ .harness/hx.mjs')));
    assert.equal(bash('node .harness/hx.mjs check > /tmp/out.txt').stdout, '', 'lancer hx.mjs ne l\'écrit pas');
    assert.ok(asks(bash('node .harness/hx.mjs detect --json > x.json && cp x.json .harness/config.json')), 'tous les chemins cités comptent');
    assert.equal(bash('node .harness/hx.mjs check 2>&1').stdout, '');
    assert.ok(asks(bash('cp /tmp/x.json .harness/config.json')));
  });

  test('pre-tool-use : openspec-apply-change redirigé vers hx-implement, autres skills libres', () => {
    const root = project({ components: {} });
    const skill = (name) => hook('pre-tool-use', root, { tool_name: 'Skill', tool_input: { skill: name } });
    assert.ok(asks(skill('openspec-apply-change')));
    assert.match(skill('openspec-apply-change').stdout, /hx-implement/);
    assert.equal(skill('hx-implement').stdout, '');
    assert.equal(skill('openspec-propose').stdout, '');
  });

  test('pre-tool-use : un lien symbolique vers le projet ne contourne pas la protection', () => {
    const root = project({ components: {} });
    const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-link-')), 'proj');
    fs.symlinkSync(root, link);
    assert.ok(asks(hook('pre-tool-use', link, { tool_input: { file_path: path.join(root, 'openspec/specs/x/spec.md') } })));
  });

  test('post-tool-use : lint-file en échec → code 2 avec la sortie ; sans lint-file ou sur un .md → rien', () => {
    const withFile = project({ components: { app: { path: '.', commands: { lint: ok, 'lint-file': `${ko} {file}` } } } });
    const r = hook('post-tool-use', withFile, { tool_input: { file_path: path.join(withFile, 'src/a.js') } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /lint KO/);
    assert.equal(hook('post-tool-use', withFile, { tool_input: { file_path: path.join(withFile, 'README.md') } }).code, 0);
    const without = project({ components: { app: { path: '.', commands: { lint: ko } } } });
    assert.equal(hook('post-tool-use', without, { tool_input: { file_path: path.join(without, 'src/a.js') } }).code, 0);
  });

  test('contrat illisible ou cassé : retour à Claude au lieu d\'un silence ; projet non personnalisé : rien', () => {
    const broken = project({});
    fs.writeFileSync(path.join(broken, '.harness/config.json'), '{ "components": {}, }');
    const r = hook('post-tool-use', broken, { tool_input: { file_path: path.join(broken, 'src/a.js') } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /config\.json invalide/);
    const wrongType = project({ components: { app: { path: '.', commands: { lint: ['eslint', '.'] } } } });
    assert.equal(hook('stop', wrongType, { session_id: 's' }).code, 2);
    const fresh = project({ components: {} });
    assert.equal(hook('post-tool-use', fresh, { tool_input: { file_path: path.join(fresh, 'src/a.js') } }).code, 0);
  });

  test('stop : contrôles rapides du composant édité pendant la session, jamais deux fois de suite', () => {
    const root = project({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'src/a.js': 'x\n' });
    const session = { session_id: `s-${Date.now()}` };
    assert.equal(hook('stop', root, session).code, 0, 'rien édité dans cette session');
    hook('post-tool-use', root, { ...session, tool_input: { file_path: path.join(root, 'src/a.js') } });
    const r = hook('stop', root, session);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /contrôles rapides/);
    assert.equal(hook('stop', root, { ...session, stop_hook_active: true }).code, 0);
    assert.equal(hook('stop', root, { session_id: 'autre-session' }).code, 0, 'les éditions sont propres à la session');
  });

  test('stop : seuls les composants touchés sont contrôlés, la liste est vidée au vert', () => {
    const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-mark-')), 'web-ran');
    const config = { components: {
      api: { path: 'api', commands: { lint: ko } },
      web: { path: 'web', commands: { lint: `node -e "require('fs').writeFileSync(process.argv[1], '')" ${JSON.stringify(marker)}` } },
    } };
    const root = project(config, { 'api/a.py': 'x\n', 'web/a.js': 'x\n', 'docs/notes.md': 'x\n' });
    const session = { session_id: `s-${Date.now()}` };
    for (const rel of ['web/a.js', 'docs/notes.md', 'README.md']) {
      hook('post-tool-use', root, { ...session, tool_input: { file_path: path.join(root, rel) } });
    }
    assert.equal(hook('stop', root, session).code, 0, 'api, en échec, n\'a pas été touché');
    assert.ok(fs.existsSync(marker), 'le lint de web a tourné');
    fs.rmSync(marker);
    assert.equal(hook('stop', root, session).code, 0);
    assert.ok(!fs.existsSync(marker), 'liste vidée après un passage au vert');
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
