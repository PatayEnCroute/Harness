// Lint statique du template : standard Agent Skills, budgets de contexte, cohérence des références, sécurité.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const template = path.resolve(here, '..', 'template');
const claude = path.join(template, '.claude');

const read = (file) => fs.readFileSync(file, 'utf8');
const dirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const files = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Frontmatter YAML minimal : clés de premier niveau, valeurs scalaires ou listes « - x ».
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(m, 'frontmatter absent');
  const data = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      data[key] = kv[2] === '' ? [] : kv[2].replace(/^["']|["']$/g, '');
    } else if (item && Array.isArray(data[key])) {
      data[key].push(item[1].replace(/^["']|["']$/g, ''));
    }
  }
  return { data, body: text.slice(m[0].length) };
}

const skills = dirs(path.join(claude, 'skills'));
const agents = files(path.join(claude, 'agents'), '.md').map((f) => f.replace(/\.md$/, ''));

describe('skills (standard Agent Skills)', () => {
  for (const name of skills) {
    test(name, () => {
      const { data, body } = frontmatter(read(path.join(claude, 'skills', name, 'SKILL.md')));
      assert.equal(data.name, name, 'name = nom du dossier');
      assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'name en minuscules et tirets');
      assert.ok(data.description && data.description.length <= 1024, 'description présente, ≤ 1024 caractères');
      assert.match(data.description, /À (utiliser|lancer)/, 'la description dit quand l\'utiliser');
      assert.ok(body.split('\n').length < 500, 'corps < 500 lignes');
    });
  }
});

describe('agents', () => {
  for (const name of agents) {
    test(name, () => {
      const { data } = frontmatter(read(path.join(claude, 'agents', `${name}.md`)));
      assert.equal(data.name, name, 'name = nom du fichier');
      assert.ok(data.description, 'description présente');
      assert.ok(data.tools, 'outils explicites');
      const readOnly = /lecture seule/.test(data.description) || /reviewer|explorer|architect|verifier/.test(name);
      if (readOnly) assert.doesNotMatch(data.tools, /\b(Edit|Write)\b/, 'agent en lecture seule sans Edit ni Write');
    });
  }
});

describe('rules', () => {
  for (const file of files(path.join(claude, 'rules'), '.md')) {
    test(file, () => {
      const { data, body } = frontmatter(read(path.join(claude, 'rules', file)));
      assert.ok(Array.isArray(data.paths) && data.paths.length > 0, 'paths: ciblage par chemin');
      assert.ok(body.split('\n').length <= 60, 'rule courte (≤ 60 lignes)');
    });
  }
});

describe('cohérence et budgets', () => {
  test('CLAUDE.md ≤ 100 lignes et importe la carte du projet', () => {
    const text = read(path.join(template, 'CLAUDE.md'));
    assert.ok(text.split('\n').length <= 100);
    assert.match(text, /^@\.harness\/project\.md$/m);
  });

  test('chaque hx-* cité existe comme skill ou agent', () => {
    const known = new Set([...skills, ...agents]);
    const cited = new Set();
    for (const file of walk(template).filter((f) => f.endsWith('.md'))) {
      for (const m of read(file).matchAll(/\bhx-[a-z]+(?:-[a-z]+)*/g)) cited.add(m[0]);
    }
    const ignored = new Set(['hx-check', 'hx-todo']);
    const missing = [...cited].filter((n) => !known.has(n) && !ignored.has(n));
    assert.deepEqual(missing, []);
  });

  test('CLAUDE.md ne recopie pas les critères de piste de hx-triage (une seule source, pas de dérive)', () => {
    assert.doesNotMatch(read(path.join(template, 'CLAUDE.md')), /\| Quand \|/);
    assert.match(read(path.join(claude, 'skills', 'hx-triage', 'SKILL.md')), /\| Piste \| Critères \|/);
  });

  test('hx-setup et arch-rules.md donnent le même seuil pour configurer arch', () => {
    const setup = path.join(claude, 'skills', 'hx-setup');
    for (const file of [path.join(setup, 'SKILL.md'), path.join(setup, 'references', 'arch-rules.md')]) {
      assert.match(read(file), /au moins trois features dont les frontières comptent/, path.basename(file));
    }
  });

  test('hx-review et hx-security-reviewer citent la CI parmi les déclencheurs sécurité', () => {
    assert.match(read(path.join(claude, 'skills', 'hx-review', 'SKILL.md')), /hx-security-reviewer`, si le diff touche [^\n]*la CI/);
    assert.match(frontmatter(read(path.join(claude, 'agents', 'hx-security-reviewer.md'))).data.description, /la CI/);
  });

  test('les relecteurs rendent leurs constats au même format, que hx-review consolide', () => {
    for (const name of agents.filter((n) => n.endsWith('-reviewer'))) {
      assert.match(read(path.join(claude, 'agents', `${name}.md`)), /`\[bloquant\|important\|mineur\] chemin:ligne — /, name);
    }
  });

  test('settings.json : JSON valide, hooks vers des fichiers du template', () => {
    const settings = JSON.parse(read(path.join(claude, 'settings.json')));
    const commands = Object.values(settings.hooks).flat().flatMap((h) => h.hooks.map((x) => x.command));
    assert.ok(commands.length >= 4);
    for (const command of commands) {
      const m = /\$CLAUDE_PROJECT_DIR\/([^"]+)"/.exec(command);
      assert.ok(m && fs.existsSync(path.join(template, m[1])), command);
    }
  });

  test('settings.json : les fichiers gérés par Copier (outils du harness) ne sont jamais édités par Claude', () => {
    const { deny } = JSON.parse(read(path.join(claude, 'settings.json'))).permissions;
    for (const file of ['hx.mjs', 'hooks.mjs', 'versions.json']) {
      assert.ok(deny.includes(`Edit(/.harness/${file})`), file);
      assert.ok(fs.existsSync(path.join(template, '.harness', file.replace('versions.json', 'versions.json.jinja'))), `${file} existe dans le template`);
    }
  });

  test('settings.json : git local sans confirmation pendant un run (commit par tâche, diff des relecteurs), push confirmé', () => {
    const { allow } = JSON.parse(read(path.join(claude, 'settings.json'))).permissions;
    for (const command of ['git add *', 'git commit *', 'git diff', 'git diff *', 'git status', 'git status *']) {
      assert.ok(allow.includes(`Bash(${command})`), command);
    }
    assert.deepEqual(allow.filter((rule) => /git (push|reset|rebase|checkout|clean)/.test(rule)), []);
  });

  test('les budgets internes des hooks restent sous les délais de settings.json', async () => {
    const { LINT_FILE_TIMEOUT_MS, STOP_BUDGET_MS } = await import(pathToFileURL(path.join(template, '.harness', 'hooks.mjs')).href);
    const settings = JSON.parse(read(path.join(claude, 'settings.json')));
    const timeout = (event) => settings.hooks[event][0].hooks[0].timeout * 1000;
    assert.ok(LINT_FILE_TIMEOUT_MS < timeout('PostToolUse'), 'PostToolUse');
    assert.ok(STOP_BUDGET_MS < timeout('Stop'), 'Stop');
  });

  test('fichiers JSON du template valides', () => {
    for (const file of walk(template).filter((f) => f.endsWith('.json'))) JSON.parse(read(file));
  });

  test('aucun caractère Unicode invisible ou de contrôle bidirectionnel', () => {
    const hidden = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/;
    const offenders = walk(template).filter((f) => hidden.test(read(f)));
    assert.deepEqual(offenders, []);
  });
});

describe('CI : actions épinglées par SHA de commit', () => {
  const repo = path.resolve(here, '..');
  const shipped = path.join(template, '.github');
  const yamls = [path.join(repo, '.github'), shipped, path.join(template, '.harness', 'ci')]
    .flatMap((dir) => walk(dir))
    .filter((f) => /\.ya?ml(\.jinja)?$/.test(f));
  const pins = (file) => [...read(file).matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)].filter((m) => !m[1].startsWith('./'));

  for (const file of yamls) {
    test(path.relative(repo, file), () => {
      for (const [, ref, comment] of pins(file)) {
        assert.match(`${ref}${comment}`, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, 'uses: owner/repo@<sha> # vX.Y.Z');
      }
    });
  }

  test('le workflow livré épingle les mêmes SHA que la CI du repo (seule celle-ci est vue par Dependabot)', () => {
    const shas = (file) => new Map(pins(file).map(([, ref]) => ref.split('@')));
    const ci = shas(path.join(repo, '.github', 'workflows', 'ci.yml'));
    for (const [action, sha] of shas(path.join(shipped, 'workflows', 'hx-check.yml.jinja'))) assert.equal(sha, ci.get(action), action);
  });

  test('Dependabot met à jour les actions, dans le repo et dans les projets générés', () => {
    for (const file of [path.join(repo, '.github', 'dependabot.yml'), path.join(shipped, 'dependabot.yml')]) {
      assert.match(read(file), /package-ecosystem: github-actions/, file);
    }
  });
});
