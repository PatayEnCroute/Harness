import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkPolicy,
  defaultConfig,
  detect,
  parseScenarios,
  slugify,
  trace,
  formatTrace,
  findComponentForFile,
  main,
  checkSettings,
  createWorktree,
  mergeLeftovers,
  migrateConfig,
  nodeVersionOk,
  templateStatus,
  openspecCommand,
  parseFlags,
  resolveInvocations,
  shellQuote,
  validateConfig,
} from '../template/.harness/hx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const fixture = (name) => path.join(here, 'fixtures', name);
const commandsOf = (result) => Object.fromEntries(Object.entries(result.components).map(([n, c]) => [n, c.commands]));

function tempProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-'));
  fs.mkdirSync(path.join(root, '.harness'));
  fs.writeFileSync(path.join(root, '.harness', 'config.json'), JSON.stringify(config));
  return root;
}

const ok = 'node -e "process.exit(0)"';
const ko = 'node -e "process.exit(1)"';

describe('detect', () => {
  test('node : scripts du package.json et npm ci avec lockfile', () => {
    const result = detect(fixture('node'), { python: 'python' });
    assert.deepEqual(commandsOf(result), {
      'fixture-node': {
        setup: 'npm ci',
        lint: 'npm run lint',
        test: 'npm run test',
        'test-file': 'node --test {file}',
      },
    });
    assert.equal(result.components['fixture-node'].path, '.');
    assert.equal(result.stats.sizeHint, 'small');
  });

  test('python : unittest quand pytest est absent, nom tiré du pyproject', () => {
    const result = detect(fixture('python'), { python: 'python' });
    assert.deepEqual(commandsOf(result), {
      'fixture-python': {
        test: 'python -m unittest discover -s tests',
        'test-file': 'python -m unittest {file}',
      },
    });
    assert.match(result.notes.join('\n'), /pytest non détecté/);
  });

  test('dotnet : la solution couvre les projets imbriqués', () => {
    const result = detect(fixture('dotnet'), { python: 'python' });
    assert.deepEqual(Object.keys(result.components), ['dotnet']);
    assert.deepEqual(result.components.dotnet.commands, {
      setup: 'dotnet restore Fixture.sln',
      build: 'dotnet build Fixture.sln',
      lint: 'dotnet format Fixture.sln --verify-no-changes',
      test: 'dotnet test Fixture.sln',
    });
  });

  test('go : commandes standard du module', () => {
    const result = detect(fixture('go'), { python: 'python' });
    assert.equal(result.components.go.commands.test, 'go test ./...');
    assert.equal(result.components.go.commands.lint, 'go vet ./...');
  });

  test('mixte : un composant par stack, nommé d\'après son dossier', () => {
    const result = detect(fixture('mixed'), { python: 'python' });
    assert.deepEqual(
      Object.fromEntries(Object.entries(result.components).map(([n, c]) => [n, [c.stack, c.path]])),
      { api: ['python', 'api'], web: ['node', 'web'] },
    );
  });

  test('noms en collision : chaque composant est conservé', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-collide-')), {
      'a/api/package.json': '{"scripts":{"test":"node --test"}}',
      'b/api/package.json': '{"scripts":{"test":"node --test"}}',
      'c/api/package.json': '{"scripts":{"test":"node --test"}}',
    });
    const result = detect(root, { python: 'python' });
    assert.deepEqual(Object.entries(result.components).map(([name, c]) => `${name}=${c.path}`).sort(), ['api-node=b/api', 'api=a/api', 'c-api-node=c/api']);
  });

  test('aucune stack reconnue : une remarque, aucun composant', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-empty-'));
    const result = detect(root, { python: 'python' });
    assert.deepEqual(result.components, {});
    assert.match(result.notes[0], /aucune stack reconnue/);
  });
});

describe('résolution des commandes', () => {
  const root = path.join(os.tmpdir(), 'hx-root');
  const config = {
    components: {
      app: { path: '.', commands: { test: 'app-test', lint: 'app-lint' } },
      web: { path: 'web', commands: { test: 'web-test', 'test-file': 'web-test {file}' } },
    },
  };

  test('un fichier est rattaché au composant le plus spécifique', () => {
    const match = findComponentForFile(config, root, path.join(root, 'web', 'src', 'a.test.js'));
    assert.equal(match.component.name, 'web');
    assert.equal(match.relative, path.join('src', 'a.test.js'));
  });

  test('un dossier au nom voisin n\'est pas dans le composant (web2/ hors de web/)', () => {
    assert.equal(findComponentForFile(config, root, path.join(root, 'web2', 'a.js')).component.name, 'app');
  });

  test('variante -file avec {file} relatif au composant', () => {
    const [inv] = resolveInvocations(config, root, 'test', { file: path.join(root, 'web', 'src', 'a b.js') });
    assert.equal(inv.command, `web-test ${shellQuote(path.join('src', 'a b.js'))}`);
    assert.equal(inv.cwd, path.join(root, 'web'));
  });

  test('sans variante -file, la commande complète du composant', () => {
    const [inv] = resolveInvocations(config, root, 'lint', { file: path.join(root, 'README.md') });
    assert.equal(inv.command, 'app-lint');
  });

  test('fichier hors de tout composant : rien à exécuter', () => {
    const other = { components: { web: config.components.web } };
    assert.deepEqual(resolveInvocations(other, root, 'test', { file: path.join(root, 'docs', 'x.md') }), []);
  });

  test('tous les composants qui définissent la commande, ou un seul avec --component', () => {
    assert.deepEqual(resolveInvocations(config, root, 'test').map((i) => i.component), ['app', 'web']);
    assert.deepEqual(resolveInvocations(config, root, 'test', { component: 'web' }).map((i) => i.component), ['web']);
    assert.deepEqual(resolveInvocations(config, root, 'lint').map((i) => i.component), ['app']);
  });
});

describe('validation du contrat', () => {
  test('signale dossier absent, {file} manquant et niveau invalide', () => {
    const root = tempProject({});
    const issues = validateConfig({
      version: 1,
      components: { api: { path: 'absent', commands: { test: 'x', 'test-file': 'x' } } },
      architecture: { level: 7 },
    }, root);
    const errors = issues.filter((i) => i.level === 'error').map((i) => i.detail);
    assert.ok(errors.some((d) => d.includes('dossier introuvable')));
    assert.ok(errors.some((d) => d.includes('{file}')));
    assert.ok(errors.some((d) => d.includes('0 à 4')));
  });

  test('contrat sans aucune commande test : erreur', () => {
    const issues = validateConfig({ version: 1, components: { a: { path: '.', commands: { lint: 'x' } } } }, tempProject({}));
    assert.ok(issues.some((i) => i.level === 'error' && i.label === 'Tests'));
  });

  test('types invalides : erreurs structurelles au lieu d\'un plantage', () => {
    const issues = validateConfig({
      version: 1,
      components: { a: { path: 5, commands: { lint: ['eslint', '.'], test: 'x' } }, b: { path: '.', commands: 'npm test' } },
      trace: { min_coverage: 150 },
      tracks: { M: { design: 'souvent' } },
    }, tempProject({}));
    const structural = issues.filter((i) => i.structural).map((i) => i.detail);
    assert.ok(structural.some((d) => d.includes('dossier introuvable')));
    assert.ok(structural.some((d) => d.includes('« lint » vide ou invalide')));
    assert.ok(structural.some((d) => d.includes('« commands » doit être un objet')));
    assert.ok(issues.some((i) => i.label === 'Trace'));
    assert.ok(issues.some((i) => i.label === 'Pistes' && i.detail.includes('M.design')));
  });

  test('migrateConfig : ajoute les clés manquantes sans rien remplacer', () => {
    const old = { version: 1, components: { a: { path: '.', commands: { test: 'x' } } }, trace: { min_coverage: 80 }, architecture: { level: 2 } };
    const { config, added } = migrateConfig(old);
    assert.equal(config.trace.min_coverage, 80);
    assert.equal(config.architecture.level, 2);
    assert.equal(config.architecture.style, 'feature-first');
    assert.deepEqual(config.tracks, defaultConfig().tracks);
    assert.deepEqual(config.components, old.components);
    assert.ok(added.includes('tracks') && added.includes('architecture.style') && !added.includes('trace.min_coverage'));
    assert.deepEqual(migrateConfig(config).added, [], 'idempotent');
    assert.equal(old.tracks, undefined, 'entrée non modifiée');
  });

  test('aucun composant : erreur', () => {
    const issues = validateConfig(defaultConfig(), tempProject({}));
    assert.ok(issues.some((i) => i.level === 'error' && i.label === 'Composants'));
  });

  test('le config.json du template est le contrat par défaut', () => {
    const shipped = JSON.parse(fs.readFileSync(path.join(repo, 'template', '.harness', 'config.json'), 'utf8'));
    assert.deepEqual(shipped, defaultConfig());
  });
});

describe('CLI', () => {
  const quiet = async (fn) => {
    const { log, error } = console;
    console.log = () => {};
    console.error = () => {};
    try {
      return await fn();
    } finally {
      Object.assign(console, { log, error });
    }
  };

  test('check : 0 si tout passe, 1 si une étape échoue', async () => {
    const green = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ok, test: ok } } } });
    const red = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ok, test: ko } } } });
    assert.equal(await quiet(() => main(['check'], green)), 0);
    assert.equal(await quiet(() => main(['check'], red)), 1);
  });

  test('check : jamais vert sans test exécuté', async () => {
    assert.equal(await quiet(() => main(['check'], tempProject(defaultConfig()))), 1, 'contrat par défaut, 0 composant');
    const lintOnly = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ok } } } });
    assert.equal(await quiet(() => main(['check'], lintOnly)), 1);
    const two = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ok, test: ok } }, b: { path: '.', commands: { lint: ok } } } });
    assert.equal(await quiet(() => main(['check', '--component', 'b'], two)), 1, 'composant sans test');
  });

  test('check --fast : lint et typecheck seulement', async () => {
    const testKo = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ok, test: ko } } } });
    const lintKo = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ko, test: ok } } } });
    assert.equal(await quiet(() => main(['check', '--fast'], testKo)), 0);
    assert.equal(await quiet(() => main(['check', '--fast'], lintKo)), 1);
  });

  test('check : contrat invalide refusé sans plantage, composant et options vérifiés', async () => {
    const broken = tempProject({ version: 1, components: { a: { path: '.', commands: { lint: ['eslint', '.'], test: ok } } } });
    assert.equal(await quiet(() => main(['check'], broken)), 1);
    const root = tempProject({ version: 1, components: { a: { path: '.', commands: { test: ok } } } });
    assert.equal(await quiet(() => main(['check', '--component', 'toString'], root)), 2);
    assert.equal(await quiet(() => main(['check', '--component'], root)), 2);
    assert.equal(await quiet(() => main(['run', 'test', '--file'], root)), 2);
    assert.equal(await quiet(() => main(['run', 'test', '--file', '--verbose'], root)), 2);
  });

  test('run : code de sortie de la commande', async () => {
    assert.equal(await quiet(() => main(['run', 'test'], tempProject({ version: 1, components: { a: { path: '.', commands: { test: ok } } } }))), 0);
    assert.equal(await quiet(() => main(['run', 'test'], tempProject({ version: 1, components: { a: { path: '.', commands: { test: ko } } } }))), 1);
  });

  test('pistes : une erreur de piste fait échouer check', { skip: process.platform === 'win32' }, () => {
    // Faux openspec à la version épinglée : check n'appelle pas le réseau.
    const root = tempProject({ version: 1, components: { a: { path: '.', commands: { test: ok } } } });
    fs.copyFileSync(path.join(repo, 'template', '.harness', 'hx.mjs'), path.join(root, '.harness', 'hx.mjs'));
    fs.writeFileSync(path.join(root, '.harness', 'versions.json'), '{ "openspec": "0.0.0-test" }');
    writeFiles(root, {
      'bin/openspec': '#!/bin/sh\n[ "$1" = "--version" ] && echo 0.0.0-test\nexit 0\n',
      'openspec/changes/big/.openspec.yaml': 'schema: spec-driven\nx-track: L\n',
      'openspec/changes/big/specs/calc/spec.md': deltaSpec,
      'test/mult.test.js': '// @scenario calc/multiply-two-numbers\n',
    });
    fs.chmodSync(path.join(root, 'bin', 'openspec'), 0o755);
    const check = () => spawnSync(process.execPath, [path.join(root, '.harness', 'hx.mjs'), 'check'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}` },
    });
    let r = check();
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /design\.md manquant/);
    assert.match(r.stdout, /✓ trace/, 'seule la piste échoue');
    writeFiles(root, {
      'openspec/changes/big/design.md': 'Voir docs/adr/001-x.md\n',
      'docs/adr/001-x.md': '# ADR\n',
    });
    r = check();
    assert.equal(r.status, 0, r.stdout);
  });

  test('run : 3 si la commande n\'est définie nulle part ou si un --file ne concerne aucun composant (0 avec --file-only)', async () => {
    const root = tempProject({ version: 1, components: { web: { path: '.', commands: { test: ok } } } });
    fs.mkdirSync(path.join(root, 'sub'));
    const other = tempProject({ version: 1, components: { web: { path: 'sub', commands: { lint: ko } } } });
    fs.mkdirSync(path.join(other, 'sub'));
    assert.equal(await quiet(() => main(['run', 'typecheck'], root)), 3);
    assert.equal(await quiet(() => main(['run', 'lint', '--file', path.join(other, 'README.md')], other)), 3, 'rien exécuté n\'est pas un succès');
    assert.equal(await quiet(() => main(['run', 'lint', '--file', path.join(other, 'README.md'), '--file-only'], other)), 0, 'usage des hooks');
    assert.equal(await quiet(() => main(['run', 'test', '--component', 'nope'], root)), 2);
    assert.equal(await quiet(() => main(['run', 'test', '--component', 'web', '--file', path.join(root, 'a.js')], root)), 2, '--file et --component exclusifs');
  });

  test('detect --write remplit un contrat vide et refuse d\'écraser sans --force', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-detect-'));
    fs.cpSync(fixture('go'), root, { recursive: true });
    assert.equal(await quiet(() => main(['detect', '--write'], root)), 0);
    const written = JSON.parse(fs.readFileSync(path.join(root, '.harness', 'config.json'), 'utf8'));
    assert.equal(written.architecture.style, 'feature-first');
    assert.ok(Object.keys(written.components).length === 1);
    assert.equal(await quiet(() => main(['detect', '--write'], root)), 1);
    assert.equal(await quiet(() => main(['detect', '--write', '--force'], root)), 0);
  });

  test('doctor : erreur si un fichier du harness est ignoré par git', async () => {
    const root = tempProject({ version: 1, components: { a: { path: '.', commands: { test: ok, lint: ok } } } });
    fs.writeFileSync(path.join(root, '.harness', 'hx.mjs'), '');
    fs.mkdirSync(path.join(root, 'openspec'));
    fs.writeFileSync(path.join(root, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
    spawnSync('git', ['init', '-q'], { cwd: root });
    assert.equal(await quiet(() => main(['doctor', '--no-run'], root)), 0);
    fs.writeFileSync(path.join(root, '.gitignore'), '.harness/\n');
    assert.equal(await quiet(() => main(['doctor', '--no-run'], root)), 1);
  });

  test('doctor : settings.json illisible ou restes de conflit de fusion → erreur', async () => {
    const root = tempProject({ version: 1, components: { a: { path: '.', commands: { test: ok, lint: ok } } } });
    const settings = fs.readFileSync(path.join(repo, 'template', '.claude', 'settings.json'), 'utf8');
    writeFiles(root, { '.claude/settings.json': settings, 'openspec/config.yaml': 'schema: spec-driven\n' });
    assert.equal(checkSettings(root).level, 'ok');
    assert.deepEqual(mergeLeftovers(root), []);
    assert.equal(await quiet(() => main(['doctor', '--no-run'], root)), 0);

    writeFiles(root, { '.claude/settings.json': settings.replace('  "permissions"', '<<<<<<< before updating\n  "permissions"') });
    assert.equal(checkSettings(root).level, 'error');
    assert.deepEqual(mergeLeftovers(root), ['.claude/settings.json']);
    assert.equal(await quiet(() => main(['doctor', '--no-run'], root)), 1);

    writeFiles(root, { '.claude/settings.json': settings, '.claude/skills/hx-tdd/SKILL.md.rej': 'x', 'CLAUDE.md': 'a\n>>>>>>> after updating\n' });
    assert.deepEqual(mergeLeftovers(root).sort(), ['.claude/skills/hx-tdd/SKILL.md.rej', 'CLAUDE.md']);

    writeFiles(root, { 'CLAUDE.md': 'a\n', 'CLAUDE.md.rej': 'x', 'openspec/config.yaml.rej': 'x', '.github/workflows/hx-check.yml.rej': 'x' });
    fs.rmSync(path.join(root, '.claude/skills/hx-tdd/SKILL.md.rej'));
    assert.deepEqual(mergeLeftovers(root).sort(), ['.github/workflows/hx-check.yml.rej', 'CLAUDE.md.rej', 'openspec/config.yaml.rej']);
  });

  test('doctor : version du template comparée au dernier tag de la source', () => {
    const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
    const src = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-src-'));
    git(src, 'init', '-q');
    git(src, 'commit', '-q', '--allow-empty', '-m', 'a');
    const root = tempProject({});
    const answers = (commit) => fs.writeFileSync(path.join(root, '.copier-answers.yml'), `_commit: ${commit}\n_src_path: ${src}\n`);
    answers('abc1234');
    assert.match(templateStatus(root).detail, /aucun tag/);
    git(src, 'tag', 'v0.1.0');
    git(src, 'tag', 'v0.10.0');
    git(src, 'tag', 'v0.9.0');
    answers('v0.9.0');
    assert.deepEqual(templateStatus(root), { level: 'warn', detail: 'v0.9.0, dernière : v0.10.0 → uvx copier update --trust' });
    answers('v0.10.0-2-gabc1234');
    assert.equal(templateStatus(root).level, 'ok');
    fs.rmSync(path.join(root, '.copier-answers.yml'));
    assert.equal(templateStatus(root), null);
  });

  test('doctor : version minimale de Node', () => {
    assert.equal(nodeVersionOk('20.18.3'), false);
    assert.equal(nodeVersionOk('20.19.0'), true);
    assert.equal(nodeVersionOk('21.0.0'), true);
    assert.equal(nodeVersionOk('19.99.0'), false);
  });

  test('openspec : la version épinglée est respectée', () => {
    const root = tempProject({});
    fs.writeFileSync(path.join(root, '.harness', 'versions.json'), '{ "openspec": "0.0.0-pin" }');
    assert.equal(openspecCommand(root, ['list', '--json']), 'npx -y @fission-ai/openspec@0.0.0-pin list --json');
  });

  test('openspec : une version épinglée hors format est une erreur, jamais passée au shell', () => {
    const root = tempProject({});
    fs.writeFileSync(path.join(root, '.harness', 'versions.json'), '{ "openspec": "1.0.0; curl x | sh" }');
    assert.throws(() => openspecCommand(root, ['list']), /version d'OpenSpec invalide/);
    fs.writeFileSync(path.join(root, '.harness', 'versions.json'), '{}');
    assert.match(openspecCommand(root, ['list']), /@latest list$/);
  });

  test('parseFlags : valeurs, booléens et forme --clé=valeur', () => {
    assert.deepEqual(parseFlags(['test', '--file', 'a.js', '--fast', '--component=web']), {
      _: ['test'],
      file: 'a.js',
      fast: true,
      component: 'web',
    });
  });

  test('shellQuote : protège espaces et apostrophes', () => {
    assert.equal(shellQuote('src/a.js', 'linux'), 'src/a.js');
    assert.equal(shellQuote("a b'c", 'linux'), `'a b'\\''c'`);
    assert.equal(shellQuote('a b', 'win32'), '"a b"');
  });
});

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

const mainSpec = `# Calc Specification

## Purpose
Arithmétique.

## Requirements

### Requirement: Addition
The system SHALL add two integers.

#### Scenario: Ajouter deux nombres
- **WHEN** adding 2 and 3
- **THEN** the result is 5
`;

const deltaSpec = `## ADDED Requirements

### Requirement: Multiplication
The system SHALL multiply two integers.

#### Scenario: Multiply two numbers
- **WHEN** multiplying 2 and 3
- **THEN** the result is 6

## REMOVED Requirements

### Requirement: Old
**Reason**: obsolete
**Migration**: none

#### Scenario: Old behaviour
- **WHEN** x
- **THEN** y
`;

describe('worktree : un change, une branche, un dossier', () => {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', env });
  // Projet commité dans un dossier parent dédié, pour que le worktree frère reste dans le dossier temporaire.
  function repoWithHarness() {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-wt-'));
    const root = path.join(parent, 'app');
    fs.mkdirSync(path.join(root, '.harness'), { recursive: true });
    fs.writeFileSync(path.join(root, '.harness', 'hx.mjs'), '// hx\n');
    fs.writeFileSync(path.join(root, '.harness', 'config.json'), '{}\n');
    git(root, 'init', '-q');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'initial');
    return { parent, root };
  }
  const writeChange = (root, name, { validated = true } = {}) => {
    fs.mkdirSync(path.join(root, 'openspec', 'changes', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'openspec', 'changes', name, 'proposal.md'), '## Why\nx\n');
    fs.writeFileSync(path.join(root, 'openspec', 'changes', name, '.openspec.yaml'), `x-track: M\n${validated ? 'x-validated: 2026-10-18\n' : ''}`);
  };
  const savedEnv = {};
  const withGitIdentity = (fn) => {
    for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) {
      savedEnv[k] = process.env[k];
      process.env[k] = env[k];
    }
    try {
      return fn();
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };

  test('change non suivi : déplacé dans le worktree et commité sur sa branche', () => {
    const { parent, root } = repoWithHarness();
    writeChange(root, 'add-mult');
    const r = withGitIdentity(() => createWorktree(root, 'add-mult'));
    assert.equal(r.error, undefined);
    assert.deepEqual(r, { target: path.join(parent, 'app-add-mult'), branch: 'add-mult', moved: true, stayed: false });
    assert.ok(!fs.existsSync(path.join(root, 'openspec', 'changes', 'add-mult')), 'retiré du dossier principal');
    assert.ok(fs.existsSync(path.join(r.target, 'openspec', 'changes', 'add-mult', 'proposal.md')));
    assert.equal(git(r.target, 'log', '-1', '--format=%s').stdout.trim(), 'add-mult : proposition');
    assert.equal(git(r.target, 'status', '--porcelain').stdout, '');
    assert.equal(git(r.target, 'branch', '--show-current').stdout.trim(), 'add-mult');
  });

  test('piste L : les ADR non suivis cités par design.md partent avec le change', () => {
    const { parent, root } = repoWithHarness();
    writeChange(root, 'add-api');
    fs.writeFileSync(path.join(root, 'openspec', 'changes', 'add-api', 'design.md'), 'Voir docs/adr/001-api.md\n');
    fs.mkdirSync(path.join(root, 'docs', 'adr'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'adr', '001-api.md'), '# ADR-001\n');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'reste ici\n');
    const r = withGitIdentity(() => createWorktree(root, 'add-api'));
    assert.equal(r.target, path.join(parent, 'app-add-api'));
    assert.ok(fs.existsSync(path.join(r.target, 'docs', 'adr', '001-api.md')));
    assert.ok(!fs.existsSync(path.join(root, 'docs', 'adr', '001-api.md')));
    assert.ok(fs.existsSync(path.join(root, 'notes.txt')), 'un fichier sans rapport reste dans le dossier principal');
    assert.equal(git(r.target, 'status', '--porcelain').stdout, '');
  });

  test('change déjà commité : rien à déplacer ; --path et --branch respectés', () => {
    const { parent, root } = repoWithHarness();
    writeChange(root, 'add-mult');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'proposition');
    const target = path.join(parent, 'ailleurs');
    const r = createWorktree(root, 'add-mult', { target, branch: 'feat/mult' });
    assert.deepEqual(r, { target, branch: 'feat/mult', moved: false, stayed: true });
    assert.ok(fs.existsSync(path.join(root, 'openspec', 'changes', 'add-mult')));
  });

  test('change indexé mais pas commité : déplacé aussi, et retiré de l\'index du dossier principal', () => {
    const { root } = repoWithHarness();
    writeChange(root, 'add-mult');
    git(root, 'add', '-A');
    const r = withGitIdentity(() => createWorktree(root, 'add-mult'));
    assert.equal(r.error, undefined);
    assert.equal(r.moved, true);
    assert.equal(r.stayed, false);
    assert.equal(git(root, 'status', '--porcelain').stdout, '');
    assert.ok(fs.existsSync(path.join(r.target, 'openspec', 'changes', 'add-mult', '.openspec.yaml')));
  });

  test('refus : change absent, nom invalide, branche existante, harness non commité, modifications suivies', () => {
    const { root } = repoWithHarness();
    assert.match(createWorktree(root, 'absent').error, /introuvable/);
    writeChange(root, 'brouillon', { validated: false });
    assert.match(createWorktree(root, 'brouillon').error, /cadrage non validé/);
    assert.match(createWorktree(root, '../x').error, /invalide/);
    writeChange(path.join(root, 'sub'), 'c');
    assert.match(createWorktree(path.join(root, 'sub'), 'c').error, /racine de son dépôt/);
    writeChange(root, 'add-mult');
    git(root, 'branch', 'add-mult');
    assert.match(createWorktree(root, 'add-mult').error, /branche add-mult existe/);
    git(root, 'branch', '-D', 'add-mult');
    fs.writeFileSync(path.join(root, '.harness', 'config.json'), '{ "x": 1 }\n');
    assert.match(createWorktree(root, 'add-mult').error, /harness modifié/);
    git(root, 'checkout', '-q', '--', '.harness/config.json');
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'proposition');
    fs.appendFileSync(path.join(root, 'openspec', 'changes', 'add-mult', 'proposal.md'), 'y\n');
    assert.match(createWorktree(root, 'add-mult').error, /déjà commités et modifiés/);
  });

  test('permissions locales (non suivies) reprises dans le worktree', () => {
    const { root } = repoWithHarness();
    fs.mkdirSync(path.join(root, '.claude'));
    fs.writeFileSync(path.join(root, '.claude', 'settings.local.json'), '{ "permissions": { "allow": ["Bash(make *)"] } }\n');
    writeChange(root, 'add-mult');
    const r = withGitIdentity(() => createWorktree(root, 'add-mult'));
    assert.equal(r.error, undefined);
    assert.equal(fs.readFileSync(path.join(r.target, '.claude', 'settings.local.json'), 'utf8'), fs.readFileSync(path.join(root, '.claude', 'settings.local.json'), 'utf8'));
    assert.equal(git(r.target, 'log', '-1', '--format=%s').stdout.trim(), 'add-mult : proposition', 'pas commitées');
    assert.ok(!git(r.target, 'ls-files').stdout.includes('settings.local.json'));
  });

  test('CLI : lancement du run affiché pour Desktop et le terminal ; usage sans change', () => {
    const { root } = repoWithHarness();
    writeChange(root, 'add-mult');
    const lines = [];
    const log = console.log;
    console.log = (msg) => lines.push(msg);
    try {
      assert.equal(withGitIdentity(() => main(['worktree', 'add-mult'], root)), 0);
    } finally {
      console.log = log;
    }
    assert.match(lines.join('\n'), /Desktop : nouvelle session sur le dossier .*mode Auto.*\/hx-implement add-mult$/m);
    assert.match(lines.join('\n'), /Terminal : cd .* && claude --permission-mode auto "\/hx-implement add-mult"/);
    assert.equal(main(['worktree'], root), 2);
  });
});

describe('OpenSpec : scénarios et traçabilité', () => {
  test('slugify : accents, ponctuation, casse', () => {
    assert.equal(slugify('Ajouter deux nombres, vite !'), 'ajouter-deux-nombres-vite');
    assert.equal(slugify('Élément été'), 'element-ete');
  });

  test('parseScenarios : section du delta et exigence parente', () => {
    const scenarios = parseScenarios(deltaSpec);
    assert.deepEqual(scenarios.map((s) => [s.section, s.requirement, s.scenario]), [
      ['ADDED', 'Multiplication', 'Multiply two numbers'],
      ['REMOVED', 'Old', 'Old behaviour'],
    ]);
    assert.equal(parseScenarios(mainSpec)[0].section, null);
  });

  test('trace : couverture, scénarios de change sans test, tags orphelins', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-trace-')), {
      'openspec/specs/calc/spec.md': mainSpec,
      'openspec/changes/add-mult/specs/calc/spec.md': deltaSpec,
      'test/add.test.js': '// @scenario calc/ajouter-deux-nombres\n',
    });
    let report = trace(root, {});
    assert.equal(report.coverage, 100);
    assert.deepEqual(report.uncoveredChanges.map((s) => s.id), ['calc/multiply-two-numbers']);
    assert.equal(report.ok, false);

    writeFiles(root, { 'test/mult.test.js': "test('x', () => {}); // @scenario calc/multiply-two-numbers\n" });
    assert.equal(trace(root, {}).ok, true);

    writeFiles(root, { 'test/old.test.js': '# @scenario calc/supprime\n' });
    report = trace(root, {});
    assert.deepEqual(report.orphans.map((o) => [o.id, o.where]), [['calc/supprime', ['test/old.test.js:1']]]);
    assert.equal(report.ok, false);
  });

  test('trace : un tag dans le code de production ne couvre rien', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-trace-')), {
      'openspec/specs/calc/spec.md': mainSpec,
      'src/add.js': '// @scenario calc/ajouter-deux-nombres\n',
    });
    let report = trace(root, {});
    assert.equal(report.coverage, 0);
    assert.deepEqual(report.outsideTests.map((o) => o.id), ['calc/ajouter-deux-nombres']);
    assert.equal(report.ok, false);
    assert.equal(trace(root, { trace: { test_pattern: '^src/' } }).ok, true, 'convention de test du projet');
    writeFiles(root, { 'src/add.test.js': '// @scenario calc/ajouter-deux-nombres\n' });
    report = trace(root, {});
    assert.equal(report.ok, true);
  });

  test('trace : une spec dont aucun scénario n\'est lu échoue au lieu de valoir 100 %', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-trace-')), {
      'openspec/specs/calc/spec.md': '## Requirements\n\n### Requirement: Add\nThe system SHALL add.\n\n#### Scénario: mauvais titre\n',
      'openspec/changes/rm/specs/calc/spec.md': '## REMOVED Requirements\n\n### Requirement: Old\n',
    });
    const report = trace(root, {});
    assert.equal(report.coverage, 100);
    assert.deepEqual(report.empty, ['openspec/specs/calc/spec.md'], 'un delta REMOVED seul n\'a pas de scénario à lire');
    assert.equal(report.ok, false);
    assert.match(formatTrace(report), /aucun scénario lu/);
  });

  test('trace : couverture minimale configurable', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-trace-')), { 'openspec/specs/calc/spec.md': mainSpec });
    assert.equal(trace(root, {}).ok, false);
    assert.equal(trace(root, { trace: { min_coverage: 0 } }).ok, true);
  });

  test('checkPolicy : piste L exige design.md et un ADR existant', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-policy-')), {
      'openspec/changes/big/.openspec.yaml': 'schema: spec-driven\nx-track: L\n',
      'openspec/changes/big/specs/calc/spec.md': deltaSpec,
      'openspec/changes/small/.openspec.yaml': 'schema: spec-driven\n',
    });
    const details = () => checkPolicy(root).map((i) => `${i.level} ${i.label} ${i.detail}`);
    assert.ok(details().some((d) => d.startsWith('error big') && d.includes('design.md manquant')));
    assert.ok(details().some((d) => d.startsWith('error small') && d.includes('piste non déclarée')));
    writeFiles(root, { 'openspec/changes/big/design.md': '## Besoin\nVoir docs/adr/001-cache.md\n' });
    assert.ok(details().some((d) => d.includes('ADR introuvable : docs/adr/001-cache.md')));
    writeFiles(root, { 'docs/adr/001-cache.md': '# ADR-001\n' });
    assert.ok(!details().some((d) => d.startsWith('error big')));
    writeFiles(root, { 'openspec/changes/big/design.md': '## Besoin\nVoir [ADR](docs/adr/002-décision.md).\n' });
    assert.ok(details().some((d) => d.includes('ADR introuvable : docs/adr/002-décision.md')));
  });

  test('checkPolicy : règles lues dans « tracks » du contrat', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-tracks-')), {
      'openspec/changes/feat/.openspec.yaml': 'schema: spec-driven\nx-track: M\n',
      'openspec/changes/feat/specs/calc/spec.md': deltaSpec,
      'openspec/changes/hotfix/.openspec.yaml': 'schema: spec-driven\nx-track: XS\n',
      'openspec/changes/nospec/.openspec.yaml': 'schema: spec-driven\nx-track: M\n',
    });
    const errors = (config) => checkPolicy(root, config).filter((i) => i.level === 'error').map((i) => `${i.label} ${i.detail}`);
    assert.deepEqual(errors({}).sort(), ['hotfix x-track invalide : XS (pistes : S, M, L)', 'nospec piste M : aucune delta spec (specs/<capability>/spec.md)']);
    const strict = { tracks: { M: { design: 'required' }, XS: { spec: false } } };
    assert.deepEqual(errors(strict).sort(), ['feat piste M : design.md manquant', 'nospec piste M : aucune delta spec (specs/<capability>/spec.md)', 'nospec piste M : design.md manquant']);
  });
});
