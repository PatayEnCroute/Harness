import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// Projet versionné, comme dans la vraie vie : le hook Stop lit les changements dans git.
function gitProject(config, files = {}) {
  const root = project(config, files);
  const git = (...args) => spawnSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=e', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'initial');
  return { root, git };
}

const write = (root, rel, content = 'modifié\n') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};

const ok = 'node -e "process.exit(0)"';
const ko = 'node -e "console.error(\'lint KO\'); process.exit(1)"';

describe('hooks Claude Code', () => {
  const decision = (r) => (r.stdout === '' ? null : JSON.parse(r.stdout).hookSpecificOutput);
  const noted = (r) => typeof decision(r)?.additionalContext === 'string' && decision(r).permissionDecision === undefined;

  test('pre-tool-use : jamais de confirmation ; contexte pour Claude sur une spec principale, silence ailleurs', () => {
    const root = project({ components: {} });
    const spec = hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'openspec/specs/calc/spec.md') } });
    assert.ok(noted(spec));
    assert.match(decision(spec).additionalContext, /\/opsx:sync/);
    const free = hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src/a.js') } });
    assert.equal(free.code, 0);
    assert.equal(free.stdout, '');
    const outside = path.join(path.dirname(root), 'ailleurs', 'openspec', 'specs', 'x', 'spec.md');
    assert.equal(hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: outside } }).stdout, '');
  });

  test('pre-tool-use : contexte pour le contrat, les hooks et les permissions, sans confirmation', () => {
    const root = project({ components: {} });
    for (const rel of ['.harness/config.json', '.harness/hx.mjs', '.harness/hooks.mjs', '.harness/versions.json', '.claude/settings.json', '.claude/settings.local.json']) {
      assert.ok(noted(hook('pre-tool-use', root, { tool_name: 'Write', tool_input: { file_path: path.join(root, rel) } })), rel);
    }
    assert.equal(hook('pre-tool-use', root, { tool_name: 'Edit', tool_input: { file_path: path.join(root, '.harness/project.md') } }).stdout, '');
  });

  test('pre-tool-use : une commande Bash passe sans décision du hook (le mode de permission décide, Stop signale)', () => {
    const root = project({ components: {} });
    for (const command of [`echo '{}' > .harness/config.json`, 'git push', 'git rm x.md']) {
      assert.equal(hook('pre-tool-use', root, { tool_name: 'Bash', tool_input: { command } }).stdout, '', command);
    }
  });

  test('pre-tool-use : openspec-apply-change refusé avec renvoi vers hx-implement, autres skills libres', () => {
    const root = project({ components: {} });
    const skill = (name) => hook('pre-tool-use', root, { tool_name: 'Skill', tool_input: { skill: name } });
    for (const name of ['openspec-apply-change', 'openspec:openspec-apply-change']) {
      assert.equal(decision(skill(name)).permissionDecision, 'deny', name);
    }
    assert.match(decision(skill('openspec-apply-change')).permissionDecisionReason, /hx-implement.*\/opsx:apply/);
    assert.equal(skill('hx-implement').stdout, '');
    assert.equal(skill('openspec-propose').stdout, '');
  });

  test('pre-tool-use : hx-ship lancé par Claude seulement si hx confidence autorise la livraison automatique', () => {
    const meta = 'x-track: M\nx-validated: 2026-10-18\nx-review-confirmed: 0\nx-review-minors: 0\nx-review-deferred: 0\nx-run-assumptions: 0\n';
    const change = { 'openspec/changes/add-mult/.openspec.yaml': meta, 'openspec/changes/add-mult/tasks.md': '- [x] 1.1 a\n', 'openspec/changes/add-mult/run-report.md': '## add-mult : Prêt à livrer\n' };
    const { root, git } = gitProject({ components: {}, ship: { auto: true } });
    git('branch', '-M', 'main');
    git('checkout', '-qb', 'add-mult');
    for (const [rel, content] of Object.entries({ ...change, 'src/mult.js': 'm\n' })) write(root, rel, content);
    git('add', '-A');
    git('commit', '-qm', 'run');
    const ship = (args) => hook('pre-tool-use', root, { tool_name: 'Skill', tool_input: { skill: 'hx-ship', args } });
    assert.equal(ship('add-mult').stdout, '');
    assert.equal(ship(undefined).stdout, '', 'change déduit quand il est seul');
    write(root, 'openspec/changes/add-mult/run-report.md', '## add-mult : Bloqué : spec fausse\n');
    const refused = decision(ship('add-mult'));
    assert.equal(refused.permissionDecision, 'deny');
    assert.match(refused.permissionDecisionReason, /rapport de fin de run : Bloqué.*l'utilisateur lance \/hx-ship lui-même/);
    const off = project({ components: {} }, change);
    assert.match(decision(hook('pre-tool-use', off, { tool_name: 'Skill', tool_input: { skill: 'hx-ship', args: 'add-mult' } })).permissionDecisionReason, /ship\.auto/);
  });

  test('pre-tool-use : un lien symbolique vers le projet ne fait pas manquer un chemin protégé', () => {
    const root = project({ components: {} });
    const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-link-')), 'proj');
    fs.symlinkSync(root, link);
    assert.ok(noted(hook('pre-tool-use', link, { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'openspec/specs/x/spec.md') } })));
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

  test('stop : contrôles rapides du code modifié pendant la session, même par Bash ; jamais deux fois de suite', () => {
    const { root } = gitProject({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'src/a.js': 'x\n', 'src/old.js': 'x\n' });
    write(root, 'src/old.js', 'modifié avant la session\n');
    const session = { session_id: `s-${Date.now()}` };
    hook('session-start', root, session);
    assert.equal(hook('stop', root, session).code, 0, 'rien modifié dans cette session');
    write(root, 'src/a.js'); // écrit hors des outils Edit/Write, comme un « sed -i » : seul git le voit
    const r = hook('stop', root, session);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /contrôles rapides/);
    assert.equal(hook('stop', root, { ...session, stop_hook_active: true }).code, 0);
  });

  test('worktree natif (Desktop) : CLAUDE_PROJECT_DIR reste sur le dossier principal, les contrôles suivent le cwd', () => {
    const { root, git } = gitProject({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'src/a.js': 'x\n' });
    const wt = path.join(root, '.claude', 'worktrees', 'tache');
    git('worktree', 'add', '-q', '-b', 'tache', wt);
    const session = { session_id: `s-${Date.now()}`, cwd: path.join(wt, 'src') };
    hook('session-start', root, session);
    write(wt, 'src/a.js');
    assert.equal(hook('stop', root, session).code, 2, 'le code modifié dans le worktree est contrôlé');
    assert.equal(hook('stop', root, { ...session, cwd: undefined }).code, 0, 'sans cwd : dossier principal, rien de modifié');
    assert.ok(noted(hook('pre-tool-use', root, { ...session, tool_name: 'Edit', tool_input: { file_path: path.join(wt, 'openspec/specs/calc/spec.md') } })));
    const other = gitProject({ components: {} }).root;
    assert.equal(hook('stop', root, { ...session, cwd: other }).code, 0, 'autre dépôt : dossier principal');
  });

  test('stop : un fichier modifié puis commité pendant la session est contrôlé', () => {
    const { root, git } = gitProject({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'src/a.js': 'x\n' });
    const session = { session_id: `s-${Date.now()}` };
    hook('session-start', root, session);
    write(root, 'src/a.js');
    git('commit', '-qam', 'tâche');
    assert.equal(hook('stop', root, session).code, 2);
  });

  test('stop : seuls les composants touchés sont contrôlés, et plus au tour suivant une fois au vert', () => {
    const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-mark-')), 'web-ran');
    const config = { components: {
      api: { path: 'api', commands: { lint: ko } },
      web: { path: 'web', commands: { lint: `node -e "require('fs').writeFileSync(process.argv[1], '')" ${JSON.stringify(marker)}` } },
    } };
    const { root } = gitProject(config, { 'api/a.py': 'x\n', 'web/a.js': 'x\n', 'docs/notes.md': 'x\n' });
    const session = { session_id: `s-${Date.now()}` };
    hook('session-start', root, session);
    for (const rel of ['web/a.js', 'docs/notes.md', 'README.md']) write(root, rel);
    assert.equal(hook('stop', root, session).code, 0, 'api, en échec, n\'a pas été touché');
    assert.ok(fs.existsSync(marker), 'le lint de web a tourné');
    fs.rmSync(marker);
    assert.equal(hook('stop', root, session).code, 0);
    assert.ok(!fs.existsSync(marker), 'déjà contrôlé au vert, rien de nouveau');
  });

  test('stop : chemins protégés modifiés signalés à l\'utilisateur, une fois, même écrits par Bash', () => {
    const { root } = gitProject({ components: { app: { path: '.', commands: { lint: ok } } } }, { 'src/a.js': 'x\n', '.harness/hooks.mjs': '// hooks\n' });
    const session = { session_id: `s-${Date.now()}` };
    hook('session-start', root, session);
    write(root, '.harness/hooks.mjs', '// contourné par « cd .harness && sed -i »\n');
    const r = hook('stop', root, session);
    assert.equal(r.code, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /\.harness\/hooks\.mjs/);
    assert.equal(hook('stop', root, session).stdout, '', 'signalé une seule fois');
  });

  test('stop : une commande trop lente est arrêtée et signalée', () => {
    const slow = 'node -e "setTimeout(() => {}, 60000)"';
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { execute } from ${JSON.stringify(pathToFileURL(path.resolve(here, '..', 'template', '.harness', 'hx.mjs')).href)};
      const r = execute(${JSON.stringify(slow)}, process.cwd(), { capture: true, timeout: 300 });
      console.log(JSON.stringify({ ok: r.ok, timedOut: r.timedOut, output: r.output }));
    `], { encoding: 'utf8' });
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, false);
    assert.equal(out.timedOut, true);
    assert.match(out.output, /délai/);
  });

  test('stop : hors d\'un dépôt git, aucun contrôle', () => {
    const root = project({ components: { app: { path: '.', commands: { lint: ko } } } }, { 'src/a.js': 'x\n' });
    assert.equal(hook('stop', root, { session_id: `s-${Date.now()}` }).code, 0);
  });

  test('session-start : changes en cours et projet à personnaliser', () => {
    const root = project({ components: {} }, {
      '.harness/project.md': '<!-- hx:todo -->\n',
      'openspec/changes/add-mult/.openspec.yaml': 'schema: spec-driven\nx-track: M\n',
      'openspec/changes/add-mult/tasks.md': '## 1\n- [x] 1.1 a\n- [ ] 1.2 b\n',
      'openspec/changes/add-div/.openspec.yaml': 'schema: spec-driven\nx-track: M\nx-validated: 2026-10-18\n',
      'openspec/changes/add-div/run-report.md': '## add-div : Prêt à livrer\n',
    });
    const r = hook('session-start', root);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /\/hx-setup/);
    assert.match(r.stdout, /add-mult \(piste M, cadrage non validé, 1\/2 tâches\)/);
    assert.match(r.stdout, /add-div \(piste M, cadrage validé le 2026-10-18, 0\/0 tâches, rapport : Prêt à livrer\)/);
    assert.doesNotMatch(r.stdout, /autres worktrees/);
  });

  test('session-start : changes des autres worktrees signalés, avec leur étape', () => {
    const { root, git } = gitProject({ components: {} });
    const other = `${root}-add-mult`;
    git('worktree', 'add', '-q', '-b', 'add-mult', other);
    write(other, 'openspec/changes/add-mult/.openspec.yaml', 'x-track: M\nx-validated: 2026-10-18\n');
    write(other, 'openspec/changes/add-mult/tasks.md', '- [x] 1.1 a\n- [ ] 1.2 b\n');
    const r = hook('session-start', root);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Changes dans d'autres worktrees : add-mult \(run en cours\)\. Détail : node \.harness\/hx\.mjs status/);
  });

  test('session-start : CLI openspec installée si absente ; en local, une autre version est laissée', { skip: process.platform === 'win32' }, () => {
    const root = project({ components: {} }, { '.harness/versions.json': JSON.stringify({ openspec: '1.2.3' }) });
    // PATH réduit à des faux npm et openspec : rien n'est installé pour de vrai.
    const run = (openspec, remote) => {
      const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-bin-'));
      const log = path.join(bin, 'npm.log');
      fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\n`, { mode: 0o755 });
      if (openspec) fs.writeFileSync(path.join(bin, 'openspec'), `#!/bin/sh\necho ${openspec}\n`, { mode: 0o755 });
      const r = hook('session-start', root, {}, { PATH: bin, CLAUDE_CODE_REMOTE: remote ? 'true' : '' });
      return { stdout: r.stdout, npm: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : '' };
    };
    const absent = run(null, false);
    assert.equal(absent.npm, 'i -g @fission-ai/openspec@1.2.3');
    assert.match(absent.stdout, /openspec 1\.2\.3 installée/);
    assert.equal(run('9.9.9', false).npm, '', 'en local, la version d\'un autre projet est gardée');
    assert.equal(run('1.2.3', false).npm, '');
    assert.equal(run('9.9.9', true).npm, 'i -g @fission-ai/openspec@1.2.3', 'en session cloud, la version épinglée');
  });

  test('événement inconnu ou entrée invalide : jamais bloquant', () => {
    const root = project({ components: {} });
    assert.equal(hook('nope', root).code, 0);
    const r = spawnSync(process.execPath, [hooks, 'post-tool-use'], { input: 'pas du json', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    assert.equal(r.status, 0);
  });
});
