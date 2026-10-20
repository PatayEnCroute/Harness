// Lanceur npx (bin/harness.mjs) : options, vérifications du dépôt avant installation, version de Copier.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COPIER_VERSION, findUvx, openClaude, parseArgs, preflight } from '../bin/harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hx-launcher-'));
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=e', ...args], { cwd, encoding: 'utf8' });

describe('lanceur npx', () => {
  test('options : les siennes sont retirées, le reste va à copier', () => {
    const opts = parseArgs(['--no-claude', '--vcs-ref', 'v0.4.0', '--template', '/tmp/h', '--defaults']);
    assert.equal(opts.claude, false);
    assert.equal(opts.template, '/tmp/h');
    assert.deepEqual(opts.copier, ['--vcs-ref', 'v0.4.0', '--defaults']);
    assert.equal(parseArgs([]).template, 'gh:PatayEnCroute/Harness');
    assert.equal(parseArgs([]).claude, 'desktop');
    assert.equal(parseArgs(['--terminal']).claude, 'terminal');
    assert.equal(parseArgs(['--terminal', '--no-claude']).claude, false);
    assert.equal(parseArgs(['--no-claude', '--terminal']).claude, false);
  });

  test('fin : Desktop par défaut, terminal sur demande, consigne si la CLI manque ou refuse --desktop', () => {
    const outcome = (mode, { tty = true, cli = true, status = 0 } = {}) => {
      const calls = [];
      const lines = [];
      const log = console.log;
      console.log = (msg) => lines.push(msg);
      try {
        const code = openClaude(mode, '/p', { tty, has: () => cli, exec: (cmd, args) => (calls.push(args.join(' ')), { status }) });
        return { code, calls, out: lines.join('\n') };
      } finally {
        console.log = log;
      }
    };
    assert.deepEqual(outcome('desktop').calls, ['--desktop']);
    assert.match(outcome('desktop').out, /Desktop s'ouvre.*\/hx-setup/);
    assert.deepEqual(outcome('terminal').calls, ['/hx-setup']);
    for (const r of [outcome('desktop', { status: 1 }), outcome('desktop', { cli: false }), outcome('desktop', { tty: false }), outcome(false)]) {
      assert.equal(r.code, 0);
      assert.match(r.out, /Claude Code Desktop, ouvre une nouvelle session sur ce dossier et tape \/hx-setup/);
    }
    assert.deepEqual(outcome(false).calls, []);
  });

  test('dépôt : dossier vide → git init ; hors git, arbre sale ou déjà installé → refus', () => {
    assert.deepEqual(preflight(tmp()), { init: true });

    const loose = tmp();
    fs.writeFileSync(path.join(loose, 'a.txt'), 'x');
    assert.match(preflight(loose).error, /git init/);

    git(loose, 'init', '-q');
    git(loose, 'add', '-A');
    git(loose, 'commit', '-qm', 'initial');
    assert.deepEqual(preflight(loose), {});

    fs.writeFileSync(path.join(loose, 'a.txt'), 'modifié');
    assert.match(preflight(loose).error, /pas commités/);

    git(loose, 'commit', '-qam', 'suite');
    fs.writeFileSync(path.join(loose, '.copier-answers.yml'), '_src_path: gh:PatayEnCroute/Harness\n');
    assert.match(preflight(loose).error, /déjà installé.*update --trust/s);
  });

  test('uvx : trouvé là où l\'installeur officiel le pose', () => {
    const home = tmp();
    const bin = path.join(home, '.local', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const exe = path.join(bin, process.platform === 'win32' ? 'uvx.exe' : 'uvx');
    fs.writeFileSync(exe, '');
    const r = findUvx(home);
    assert.ok(r === 'uvx' || r === exe, `${r}`);
  });

  test('version de Copier : la même que copier.yml, la CI et INSTALL.md', () => {
    assert.match(fs.readFileSync(path.join(repo, 'copier.yml'), 'utf8'), new RegExp(`_min_copier_version: "${COPIER_VERSION}"`));
    assert.match(fs.readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8'), new RegExp(`COPIER_VERSION: "${COPIER_VERSION}"`));
    for (const m of fs.readFileSync(path.join(repo, 'INSTALL.md'), 'utf8').matchAll(/copier@([\d.]+)/g)) assert.equal(m[1], COPIER_VERSION);
  });

  test('INSTALL.md : chaque question de copier.yml a sa ligne et son --data', () => {
    const install = fs.readFileSync(path.join(repo, 'INSTALL.md'), 'utf8');
    // Questions : clés de premier niveau hors « _ », sauf les valeurs calculées (when: false).
    const questions = fs.readFileSync(path.join(repo, 'copier.yml'), 'utf8').split(/\n(?=\w)/)
      .filter((block) => /^[a-z]\w*:/.test(block) && !/\n\s+when: false/.test(block))
      .map((block) => block.split(':')[0]);
    assert.deepEqual(questions, ['project_name', 'ci', 'default_branch', 'codeowners']);
    for (const q of questions) {
      assert.match(install, new RegExp(`\\| \`${q}\` \\|`), `${q} absente du tableau`);
      assert.match(install, new RegExp(`--data ${q}=`), `${q} absente de la commande`);
    }
  });
});
