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
  findComponentForFile,
  main,
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

  test('run : 3 si la commande n\'est définie nulle part, 0 si un --file ne concerne aucun composant', async () => {
    const root = tempProject({ version: 1, components: { web: { path: '.', commands: { test: ok } } } });
    fs.mkdirSync(path.join(root, 'sub'));
    const other = tempProject({ version: 1, components: { web: { path: 'sub', commands: { lint: ko } } } });
    fs.mkdirSync(path.join(other, 'sub'));
    assert.equal(await quiet(() => main(['run', 'typecheck'], root)), 3);
    assert.equal(await quiet(() => main(['run', 'lint', '--file', path.join(other, 'README.md')], other)), 0);
    assert.equal(await quiet(() => main(['run', 'test', '--component', 'nope'], root)), 2);
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

  test('trace : couverture minimale configurable', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-trace-')), { 'openspec/specs/calc/spec.md': mainSpec });
    assert.equal(trace(root, {}).ok, false);
    assert.equal(trace(root, { trace: { min_coverage: 0 } }).ok, true);
  });

  test('checkPolicy : piste L exige design.md et un ADR existant', () => {
    const root = writeFiles(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-policy-')), {
      'openspec/changes/big/.openspec.yaml': 'schema: spec-driven\nx-track: L\n',
      'openspec/changes/small/.openspec.yaml': 'schema: spec-driven\n',
    });
    const details = () => checkPolicy(root).map((i) => `${i.level} ${i.label} ${i.detail}`);
    assert.ok(details().some((d) => d.startsWith('error big') && d.includes('design.md manquant')));
    assert.ok(details().some((d) => d.startsWith('warn small') && d.includes('piste non déclarée')));
    writeFiles(root, { 'openspec/changes/big/design.md': '## Besoin\nVoir docs/adr/001-cache.md\n' });
    assert.ok(details().some((d) => d.includes('ADR introuvable : docs/adr/001-cache.md')));
    writeFiles(root, { 'docs/adr/001-cache.md': '# ADR-001\n' });
    assert.ok(!details().some((d) => d.startsWith('error')));
    writeFiles(root, { 'openspec/changes/big/design.md': '## Besoin\nVoir [ADR](docs/adr/002-décision.md).\n' });
    assert.ok(details().some((d) => d.includes('ADR introuvable : docs/adr/002-décision.md')));
  });
});
