// La documentation ne ment pas sur le dépôt : chaque lien relatif mène à un fichier, chaque job de la CI et chaque
// script npm cité existe, et chaque job de ci.yml est documenté.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const markdown = (dir) => fs.readdirSync(path.join(repo, dir)).filter((f) => f.endsWith('.md')).map((f) => path.posix.join(dir, f));
const docs = ['README.md', 'INSTALL.md', 'CHANGELOG.md', 'evals/README.md', 'template/.harness/README.md', ...markdown('docs'), ...markdown('docs/adr'), ...markdown('docs/research')];

describe('documentation', () => {
  for (const file of docs) {
    test(`${file} : liens relatifs valides`, () => {
      // Hors blocs de code : un exemple peut citer un chemin qui n'existe que dans un projet installé.
      const text = read(file).replace(/```[\s\S]*?```/g, '');
      const broken = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1])
        .filter((target) => !/^(https?:|mailto:|#)/.test(target))
        .filter((target) => !fs.existsSync(path.resolve(repo, path.dirname(file), decodeURIComponent(target.split('#')[0]))));
      assert.deepEqual(broken, []);
    });
  }

  const ci = read('.github/workflows/ci.yml');
  // « unit (${{ matrix.os }}, …) » → « unit » : le nom du job sans sa partie calculée.
  const jobs = [...ci.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1].replace(/ \(\$\{\{.*$/, '').trim());

  test('chaque job de ci.yml est documenté dans le README et le plan directeur', () => {
    assert.ok(jobs.length >= 8, `jobs trouvés : ${jobs.join(', ')}`);
    for (const doc of ['README.md', 'docs/PLAN.md']) {
      for (const job of jobs) assert.ok(read(doc).includes(`\`${job}`), `${doc} : job « ${job} » absent`);
    }
  });

  test('chaque script npm cité existe', () => {
    const { scripts } = JSON.parse(read('package.json'));
    for (const file of ['README.md', 'docs/PLAN.md', 'docs/parite.md', 'evals/README.md']) {
      for (const [, name] of read(file).matchAll(/`npm run ([\w:-]+)/g)) assert.ok(scripts[name], `${file} : npm run ${name}`);
    }
  });

  test('la page de présentation compte les outils qu\'elle montre', () => {
    const html = read('docs/index.html');
    const leaves = (html.match(/class="leaf"/g) ?? []).length;
    const details = (html.match(/<details id="t-/g) ?? []).length;
    assert.equal(leaves, details, 'une feuille par outil détaillé');
    assert.ok(html.includes(`${leaves} feuilles`), `titre : ${leaves} feuilles`);
    for (const id of [...html.matchAll(/class="leaf" href="#([\w-]+)"/g)].map((m) => m[1])) assert.ok(html.includes(`<details id="${id}"`), id);
  });
});
