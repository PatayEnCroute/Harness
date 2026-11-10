// Génération des fichiers des autres harness (hx adapters) : synchronisation, dérive, fichiers existants, retrait.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = path.resolve(here, '..', 'template');
const { MANIFEST, patchFiles, plan, preApproved, prefixRules, readManifest, sync, validTools } = await import(pathToFileURL(path.join(template, '.harness', 'adapters.mjs')).href);

function project() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-adapters-')));
  fs.cpSync(template, root, { recursive: true, filter: (src) => !src.includes(`${path.sep}.github`) && !src.endsWith('.jinja') });
  fs.writeFileSync(path.join(root, '.harness', 'project.md'), '# Projet démo\n\nUne calculatrice.\n');
  fs.writeFileSync(path.join(root, '.harness', 'versions.json'), '{}');
  return root;
}
const hx = (root, ...args) => {
  const r = spawnSync(process.execPath, [path.join(root, '.harness', 'hx.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

describe('hx adapters', () => {
  test('sans autre harness : rien à générer, rien à vérifier', () => {
    const root = project();
    assert.deepEqual(hx(root, 'adapters', '--tools', 'claude').code, 0);
    assert.ok(!exists(root, 'AGENTS.md') && !exists(root, MANIFEST));
    assert.equal(hx(root, 'adapters', '--check').code, 0);
  });

  test('un harness : ses fichiers seulement, AGENTS.md avec la carte du projet, manifeste', () => {
    const root = project();
    assert.equal(hx(root, 'adapters', '--tools', 'claude,codex').code, 0);
    assert.ok(exists(root, '.codex/hooks.json') && exists(root, '.agents/skills/hx-triage/SKILL.md'));
    assert.ok(!exists(root, '.opencode') && !exists(root, '.dsh') && !exists(root, '.agents/hooks.json'));
    const md = read(root, 'AGENTS.md');
    assert.match(md, /## Projet démo\n\nUne calculatrice\./);
    assert.match(md, /\| Les consignes disent \| Codex \|\n/);
    assert.deepEqual(readManifest(root).tools, ['codex']);
    assert.ok(readManifest(root).files.includes('AGENTS.md'));
    assert.equal(hx(root, 'adapters', '--check').code, 0);
  });

  test('dérive : la source change, --check et hx check le voient, hx adapters répare', () => {
    const root = project();
    sync(root, ['opencode']);
    fs.appendFileSync(path.join(root, '.harness', 'project.md'), '\n## Conventions\n\nPas de point-virgule.\n');
    fs.appendFileSync(path.join(root, '.claude', 'agents', 'hx-explorer.md'), '\nUne ligne de plus.\n');
    const check = hx(root, 'adapters', '--check');
    assert.equal(check.code, 1);
    assert.match(check.out, /AGENTS\.md/);
    assert.match(check.out, /\.opencode\/agents\/hx-explorer\.md/);
    assert.equal(hx(root, 'adapters').code, 0, 'sans --tools : les harness déjà choisis');
    assert.match(read(root, 'AGENTS.md'), /Pas de point-virgule/);
    assert.equal(hx(root, 'adapters', '--check').code, 0);
  });

  test('un skill ou un harness retiré emporte ses fichiers générés, pas ceux des autres', () => {
    const root = project();
    sync(root, ['codex', 'antigravity']);
    fs.mkdirSync(path.join(root, '.agents', 'skills', 'openspec-propose'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agents', 'skills', 'openspec-propose', 'SKILL.md'), 'installé par OpenSpec\n');
    fs.rmSync(path.join(root, '.claude', 'skills', 'hx-dream'), { recursive: true });
    assert.equal(hx(root, 'adapters', '--tools', 'claude,antigravity').code, 0);
    assert.ok(!exists(root, '.agents/skills/hx-dream') && !exists(root, '.codex'), 'skill et harness retirés');
    assert.ok(exists(root, '.agents/skills/hx-triage/SKILL.md') && exists(root, '.agents/hooks.json'));
    assert.ok(exists(root, '.agents/skills/openspec-propose/SKILL.md'), 'fichiers d\'OpenSpec intacts');
    assert.equal(hx(root, 'adapters', '--tools', 'claude').code, 0);
    assert.ok(!exists(root, 'AGENTS.md') && !exists(root, MANIFEST) && !exists(root, '.agents/hooks.json'));
  });

  test('un fichier existant que le harness n\'a pas écrit n\'est jamais écrasé sans --force', () => {
    const root = project();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Mes consignes\n');
    const refused = hx(root, 'adapters', '--tools', 'claude,dsh');
    assert.equal(refused.code, 1);
    assert.match(refused.out, /- AGENTS\.md/);
    assert.equal(read(root, 'AGENTS.md'), '# Mes consignes\n');
    assert.ok(!exists(root, '.dsh'), 'rien d\'écrit à moitié');
    assert.equal(hx(root, 'adapters', '--tools', 'claude,dsh', '--force').code, 0);
    assert.match(read(root, 'AGENTS.md'), /Instructions pour l'agent/);
  });

  test('harness inconnu : erreur d\'usage', () => {
    const root = project();
    const r = hx(root, 'adapters', '--tools', 'claude,cursor');
    assert.equal(r.code, 2);
    assert.match(r.out, /harness inconnu : cursor/);
    assert.deepEqual(validTools(['dsh', 'claude', 'codex', 'dsh']), ['codex', 'dsh']);
  });

  test('skills : fichiers de référence copiés, $ARGUMENTS remplacé', () => {
    const root = project();
    const { files } = plan(root, ['codex']);
    assert.ok('.agents/skills/hx-setup/references/ci-setup.md' in files);
    assert.doesNotMatch(String(files['.agents/skills/hx-implement/SKILL.md']), /\$ARGUMENTS/);
    assert.match(String(files['.agents/skills/hx-implement/SKILL.md']), /l'argument donné avec la demande/);
  });

  test('adapters.models : lu dans .harness/config.json, un changement se voit comme une dérive', () => {
    const root = project();
    sync(root, ['codex']);
    assert.doesNotMatch(read(root, '.codex/agents/hx-explorer.toml'), /^model = /m);
    const file = path.join(root, '.harness', 'config.json');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), adapters: { models: { codex: { haiku: 'léger-1' } } } }));
    assert.equal(hx(root, 'adapters', '--check').code, 1);
    assert.equal(hx(root, 'adapters').code, 0);
    assert.match(read(root, '.codex/agents/hx-explorer.toml'), /^model = "léger-1"$/m);
    assert.doesNotMatch(read(root, '.codex/agents/hx-architect.toml'), /^model = /m);
  });

  test('doctor signale des fichiers périmés', () => {
    const root = project();
    sync(root, ['codex']);
    assert.match(hx(root, 'doctor', '--no-run').out, /✓ Autres harness : Codex/);
    fs.appendFileSync(path.join(root, 'CLAUDE.md'), '\nUne consigne de plus.\n');
    assert.match(hx(root, 'doctor', '--no-run').out, /✗ Autres harness : fichiers périmés[^\n]*AGENTS\.md/);
  });
});

describe('traductions', () => {
  test('prefixRules : jamais plus large que la règle Claude d\'origine', () => {
    const { rules, dropped } = prefixRules(['git status', 'git status *', 'git branch', 'git branch -d *', 'git branch --show-current', 'git worktree list', 'ls', 'ls *']);
    assert.deepEqual(rules, [['git', 'branch', '--show-current'], ['git', 'branch', '-d'], ['git', 'status'], ['git', 'worktree', 'list'], ['ls']]);
    assert.deepEqual(dropped, ['git branch'], '« git branch » seul autoriserait « git branch -D »');
  });

  test('preApproved : commandes simples de la liste, rien de composé', () => {
    const allow = ['git status', 'git status *', 'node .harness/hx.mjs *', 'git branch'];
    for (const ok of ['git status', 'git status --short', 'node .harness/hx.mjs run test --file a.js']) assert.ok(preApproved(allow, ok), ok);
    for (const ko of ['', 'git branch -D main', 'git statusx', 'node .harness/hx.mjs', 'git status | sh', 'git status\nrm -rf /', 'git status `id`', 'git status > f']) {
      assert.ok(!preApproved(allow, ko), ko);
    }
  });

  test('patchFiles : fichiers modifiés, ajoutés et supprimés par un patch', () => {
    assert.deepEqual(patchFiles('*** Begin Patch\n*** Update File: src/a.js\n@@\n*** Add File: b.md\n+x\n*** Delete File: c.txt\n*** End Patch'), ['src/a.js', 'b.md', 'c.txt']);
    assert.deepEqual(patchFiles(undefined), []);
  });
});
