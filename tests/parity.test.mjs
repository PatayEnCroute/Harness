// Parité des harness : ce que Claude Code obtient du template, chaque autre harness l'obtient au niveau déclaré dans
// CAPABILITIES (adapters.mjs). Deux preuves : la structure des fichiers générés, et les mêmes scénarios de hooks rejoués
// dans le protocole de chaque harness. Un niveau « natif » ou « équivalent » doit donner le résultat de Claude Code ;
// un niveau « dégradé » ou « absent » est vérifié tel que décrit, pour qu'un progrès ou un recul oblige à le redéclarer.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const template = path.join(repo, 'template');
const adapters = await import(pathToFileURL(path.join(template, '.harness', 'adapters.mjs')).href);
const { CAPABILITIES, LEVELS, TOOLS, TOOL_IDS, formatParity, generate, parity, readSource } = adapters;

const HARNESSES = ['claude', ...TOOL_IDS];
const level = (id, tool) => (tool === 'claude' ? 'natif' : CAPABILITIES.find((c) => c.id === id)[tool][0]);
const full = (id, tool) => LEVELS[level(id, tool)] === 1;

const ok = 'node -e "process.exit(0)"';
const ko = 'node -e "console.error(\'lint KO\'); process.exit(1)"';

// Projet installé : le template, ses fichiers générés pour tous les harness, et un contrat minimal.
function project({ lint = ok, lintFile, todo = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hx-parity-')));
  fs.cpSync(template, root, { recursive: true, filter: (src) => !src.includes(`${path.sep}.github`) && !src.endsWith('.jinja') });
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  };
  write('.harness/project.md', todo ? '<!-- hx:todo -->\n# Projet démo\n' : '# Projet démo\n\nUne calculatrice.\n');
  write('.harness/versions.json', '{}');
  write('.harness/config.json', JSON.stringify({ components: { app: { path: '.', commands: { lint, ...(lintFile ? { 'lint-file': lintFile } : {}), test: ok } } }, ship: { auto: false } }));
  write('src/a.js', 'export const a = 1;\n');
  write('openspec/changes/add-mult/tasks.md', '- [ ] 1.1 Multiplier\n');
  write('openspec/changes/add-mult/.openspec.yaml', 'x-track: M\n');
  const files = generate(root, TOOL_IDS);
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  const git = (...args) => spawnSync('git', ['-c', 'user.email=e@x', '-c', 'user.name=e', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'initial');
  return { root, files, write };
}

let sessions = 0;
const session = () => `parity-${process.pid}-${sessions += 1}`;

// Appel d'un hook comme le fait chaque harness : mêmes arguments, même forme d'entrée.
function call(tool, root, event, input) {
  const args = tool === 'claude' ? [event] : [event, '--tool', tool];
  const env = { ...process.env, CLAUDE_CODE_REMOTE: '' };
  delete env.CLAUDE_PROJECT_DIR;
  if (tool === 'claude' || tool === 'dsh') env.CLAUDE_PROJECT_DIR = root;
  const r = spawnSync(process.execPath, [path.join(root, '.harness', 'hooks.mjs'), ...args], { cwd: root, input: JSON.stringify(input), encoding: 'utf8', env });
  return { code: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
}

const patch = (rel) => `*** Begin Patch\n*** Update File: ${rel}\n@@\n-a\n+b\n*** End Patch`;
const SHIP_QUESTION = { header: 'Livraison', question: 'Livrer add-mult ?', options: [{ label: 'Livrer sans les mineurs' }, { label: 'Ne pas livrer maintenant' }] };

// Entrées de chaque harness pour un même geste. null : le harness n'a pas ce point d'accroche.
const INPUT = {
  claude: {
    base: (id, root) => ({ session_id: id, cwd: root }),
    edit: (root, rel) => ({ tool_name: 'Edit', tool_input: { file_path: path.join(root, rel) } }),
    skill: (name) => ({ tool_name: 'Skill', tool_input: { skill: name, args: 'add-mult' } }),
    answer: (label) => ({ tool_name: 'AskUserQuestion', tool_input: { questions: [SHIP_QUESTION] }, tool_response: { answers: { [SHIP_QUESTION.question]: label } } }),
    prompt: (text) => ({ prompt: text }),
    shell: (command) => ({ tool_name: 'Bash', tool_input: { command } }),
  },
  codex: {
    base: (id, root) => ({ session_id: id, cwd: root }),
    edit: (_root, rel) => ({ tool_name: 'apply_patch', tool_input: { command: patch(rel) } }),
    skill: (name) => ({ tool_name: 'Bash', tool_input: { command: `cat .agents/skills/${name}/SKILL.md` } }),
    answer: (label) => ({ tool_name: 'request_user_input', tool_input: { questions: [{ id: 'ship', ...SHIP_QUESTION }] }, tool_response: { answers: { ship: { answers: [label] } } } }),
    prompt: (text) => ({ prompt: text }),
    shell: (command) => ({ tool_name: 'Bash', tool_input: { command } }),
  },
  opencode: {
    base: (id, root) => ({ session_id: id, cwd: root }),
    edit: (_root, rel) => ({ tool: 'edit', args: { filePath: rel } }),
    skill: (name) => ({ tool: 'skill', args: { name } }),
    answer: (label) => ({ tool: 'question', args: { questions: [SHIP_QUESTION] }, response: `User answered: ${label}` }),
    prompt: (text) => ({ prompt: text }),
    shell: (command) => ({ tool: 'bash', args: { command } }),
  },
  antigravity: {
    base: (id, root) => ({ conversationId: id, workspacePaths: [root] }),
    edit: (root, rel) => ({ toolCall: { name: 'replace_file_content', args: { TargetFile: path.join(root, rel) } } }),
    skill: (name) => ({ toolCall: { name: 'view_file', args: { AbsolutePath: `/x/.agents/skills/${name}/SKILL.md`, IsSkillFile: true } } }),
    answer: null,
    prompt: (text) => ({ lastUserInput: text, invocationNum: 1 }),
    shell: (command) => ({ toolCall: { name: 'run_command', args: { CommandLine: command } } }),
  },
  dsh: {
    base: (id, root) => ({ session_id: id, cwd: root, stop_hook_active: false }),
    edit: (root, rel) => ({ tool_name: 'edit', tool_input: { file_path: path.join(root, rel) } }),
    skill: (name) => ({ tool_name: 'skill', tool_input: { name } }),
    answer: (label) => ({ tool_name: 'ask_user_question', tool_input: { questions: [{ id: 'ship', ...SHIP_QUESTION }] }, tool_response: `ship: ${label}` }),
    prompt: (text) => ({ prompt: text }),
    shell: (command) => ({ tool_name: 'bash', tool_input: { command } }),
  },
};

// Résultat lu dans le protocole du harness : bloqué, confirmation demandée à l'utilisateur, approuvé, contexte rendu à l'agent.
function outcome(tool, event, r) {
  const data = r.stdout.startsWith('{') ? JSON.parse(r.stdout) : {};
  if (tool === 'opencode') return { blocked: Boolean(data.block), context: data.block ?? data.context ?? '' };
  if (tool === 'antigravity') {
    assert.equal(r.code, 0, 'Antigravity ignore un hook qui sort en erreur');
    const blocked = data.decision === 'deny' || data.decision === 'continue';
    return { blocked, asked: data.decision === 'ask', approved: data.decision === 'auto_approve', context: data.reason ?? data.injectSteps?.[0]?.systemMessage?.systemMessage ?? '' };
  }
  const specific = data.hookSpecificOutput ?? {};
  if (event === 'pre-tool-use') return { blocked: specific.permissionDecision === 'deny', context: specific.permissionDecisionReason ?? specific.additionalContext ?? '' };
  return { blocked: r.code === 2, context: r.code === 2 ? r.stderr : specific.additionalContext ?? r.stdout };
}

function run(tool, root, id, event, gesture) {
  return outcome(tool, event, call(tool, root, event, { ...INPUT[tool].base(id, root), ...gesture }));
}

describe('parité : déclaration', () => {
  test('chaque capacité a, pour chaque harness, un niveau connu et sa raison', () => {
    assert.ok(CAPABILITIES.length >= 20);
    for (const c of CAPABILITIES) {
      assert.ok(c.label && c.claude, c.id);
      for (const tool of TOOL_IDS) {
        assert.ok(Array.isArray(c[tool]) && c[tool][0] in LEVELS && c[tool][1], `${c.id} · ${tool}`);
      }
    }
    assert.equal(new Set(CAPABILITIES.map((c) => c.id)).size, CAPABILITIES.length, 'identifiants uniques');
  });

  test('README : les scores affichés sont ceux du tableau', () => {
    const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
    const { scores } = parity();
    for (const tool of TOOL_IDS) assert.match(readme, new RegExp(`\\| \`${tool}\` \\| ${scores[tool]} % \\|`), tool);
    assert.ok(readme.includes(`${CAPABILITIES.length} capacités`));
  });

  test('docs/parite.md publie le tableau à jour (node scripts/parity.mjs --write)', () => {
    assert.ok(fs.readFileSync(path.join(repo, 'docs', 'parite.md'), 'utf8').includes(formatParity(parity())));
  });
});

describe('parité : structure des fichiers générés', () => {
  const source = readSource(template);
  const files = generate(template, TOOL_IDS, source);
  const text = (rel) => String(files[rel] ?? '');
  const skillsDir = { codex: '.agents/skills', antigravity: '.agents/skills', dsh: '.agents/skills' };
  const agentFile = { codex: (n) => `.codex/agents/${n}.toml`, opencode: (n) => `.opencode/agents/${n}.md`, antigravity: (n) => `.agents/agents/${n}.md` };
  const hookConfig = { codex: '.codex/hooks.json', opencode: '.opencode/plugins/hx-harness.js', antigravity: '.agents/hooks.json', dsh: '.dsh/hooks.json' };

  test('la source du template est complète', () => {
    assert.ok(source.skills.length >= 16 && source.agents.length >= 7 && source.rules.length >= 4);
    assert.deepEqual(Object.keys(source.hooks), ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']);
  });

  for (const tool of TOOL_IDS) {
    test(`${tool} : consignes et carte du projet dans AGENTS.md`, () => {
      const md = text('AGENTS.md');
      assert.match(md, /## Commandes : toujours passer par `hx`/);
      assert.doesNotMatch(md, /^@\.harness\/project\.md$/m, 'import remplacé par le contenu');
      assert.ok(md.includes(`| ${TOOLS[tool].label} |`) || md.includes(`| ${TOOLS[tool].label}`), 'colonne d\'équivalences');
    });

    test(`${tool} : chaque skill, avec ses fichiers de référence`, () => {
      assert.equal(level('skills', tool), 'natif');
      if (!skillsDir[tool]) {
        // OpenCode lit .claude/skills : rien à générer, et surtout pas de copie divergente.
        assert.deepEqual(Object.keys(files).filter((f) => f.startsWith('.opencode/skills/')), []);
        return;
      }
      for (const skill of source.skills) {
        for (const rel of skill.files) assert.ok(`${skillsDir[tool]}/${skill.name}/${rel}` in files, `${skill.name}/${rel}`);
        const copy = adapters.frontmatter(text(`${skillsDir[tool]}/${skill.name}/SKILL.md`));
        assert.equal(copy.data.name, skill.name);
        assert.equal(copy.data.description, skill.data.description);
        assert.doesNotMatch(copy.body, /\$ARGUMENTS/, 'variable propre à Claude Code');
      }
    });

    test(`${tool} : sous-agents, lecture seule comprise`, () => {
      for (const agent of source.agents) {
        const file = agentFile[tool]?.(agent.name);
        if (!full('agents', tool)) {
          assert.equal(file, undefined, 'pas de fichier de sous-agent : niveau dégradé');
          assert.match(text('AGENTS.md'), /`\.claude\/agents\/hx-….md`/);
          continue;
        }
        const body = agent.body.trim().split('\n')[0];
        assert.ok(text(file).includes(body), `${file} reprend la consigne`);
        assert.ok(text(file).includes(agent.description.slice(0, 60)), `${file} reprend la description`);
        if (!agent.readOnly) continue;
        if (tool === 'opencode') assert.match(text(file), /^permission:\n {2}edit: deny$/m, file);
        if (tool === 'antigravity') assert.doesNotMatch(text(file), /write_to_file|replace_file_content/, file);
        if (tool === 'codex') assert.equal(level('agents-read-only', tool), 'dégradé', 'Codex ne restreint pas un agent');
      }
    });

    test(`${tool} : rules`, () => {
      for (const rule of source.rules) {
        if (full('rules', tool)) {
          const file = text(`.agents/rules/${rule.name}.md`);
          assert.match(file, /^---\ntrigger: glob\nglobs: "/);
          for (const glob of rule.paths) assert.ok(file.includes(glob), `${rule.name} · ${glob}`);
        } else {
          assert.ok(text('AGENTS.md').includes(`\`.claude/rules/${rule.name}.md\``), `${rule.name} indexée dans AGENTS.md`);
        }
      }
    });

    test(`${tool} : chaque hook du harness est câblé, ou déclaré absent`, () => {
      const config = text(hookConfig[tool]);
      const wired = (event) => config.includes(`${event} --tool ${tool}`) || (tool === 'opencode' && config.includes(`'${event}'`));
      for (const event of ['session-start', 'user-prompt-submit', 'pre-tool-use', 'stop']) assert.ok(wired(event), event);
      assert.equal(wired('post-tool-use'), level('hook-lint', tool) !== 'absent', 'post-tool-use');
      if (tool !== 'opencode') JSON.parse(config);
    });

    test(`${tool} : commandes autorisées sans confirmation`, () => {
      const allowed = { codex: () => text('.codex/rules/harness.rules'), opencode: () => text('.opencode/opencode.json') }[tool]?.();
      if (tool === 'codex') {
        assert.match(allowed, /prefix_rule\(pattern = \["node", "\.harness\/hx\.mjs"\], decision = "allow"\)/);
        assert.match(allowed, /\["git", "commit"\]/);
        assert.doesNotMatch(allowed, /\["git", "(push|branch|rm|reset)"\]/, 'ni push, ni préfixe plus large que la règle d\'origine');
      } else if (tool === 'opencode') {
        const { permission } = JSON.parse(allowed);
        for (const rule of source.allow) assert.equal(permission.bash[rule], 'allow', rule);
        assert.equal(permission.bash['*'], undefined, 'le reste suit le mode de permission');
        for (const file of source.deny) assert.equal(permission.edit[file], 'deny', file);
      } else if (tool === 'dsh') {
        assert.equal(level('permissions-allow', tool), 'absent');
      }
    });
  }

  test('dsh : le patch monte le pont de hooks et écarte CLAUDE.md', () => {
    const yml = text('.dsh/harness.patch.yml');
    assert.match(yml, /name: '@deepseek-ai\/dsh-hooks-claude-code'/);
    assert.match(yml, /configPath: \.\/\.dsh\/hooks\.json/);
    assert.match(yml, /instructionFileCandidates: \['AGENTS\.md'\]/);
    assert.doesNotMatch(text('.dsh/hooks.json'), /"matcher": "[^"]*[A-Z]/, 'noms d\'outils de dsh en minuscules');
  });

  test('opencode : un seul plugin, valide, pour la V1 et la V2', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-plugin-'));
    fs.writeFileSync(path.join(dir, 'plugin.mjs'), text('.opencode/plugins/hx-harness.js'));
    const plugin = (await import(pathToFileURL(path.join(dir, 'plugin.mjs')).href)).default;
    assert.equal(plugin.id, 'hx-harness');
    assert.equal(typeof plugin.setup, 'function', 'V2');
    assert.equal(typeof plugin.server, 'function', 'V1');
  });
});

describe('parité : mêmes décisions de hooks dans chaque harness', () => {
  for (const tool of HARNESSES) {
    const input = INPUT[tool];

    test(`${tool} : au démarrage, le harness annonce ce qui attend`, () => {
      const { root } = project({ todo: true });
      const r = run(tool, root, session(), 'session-start', { source: 'startup' });
      assert.match(r.context, /\/hx-setup/);
      assert.match(r.context, /add-mult \(piste M/);
    });

    test(`${tool} : rappel sur une spec principale, silence sur le code`, () => {
      const { root } = project();
      const id = session();
      const spec = run(tool, root, id, 'pre-tool-use', input.edit(root, 'openspec/specs/calc/spec.md'));
      assert.equal(spec.blocked, false);
      assert.match(spec.context, /\/opsx:sync/);
      const code = run(tool, root, id, 'pre-tool-use', input.edit(root, 'src/a.js'));
      assert.deepEqual([code.blocked, code.context], [false, '']);
    });

    test(`${tool} : les fichiers gérés par le template ne s'éditent pas`, () => {
      const { root } = project();
      if (tool === 'claude') {
        const { deny } = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).permissions;
        assert.ok(deny.includes('Edit(/.harness/hx.mjs)') && deny.includes('Edit(/.harness/adapters.mjs)'));
        return;
      }
      for (const file of ['.harness/hx.mjs', '.harness/hooks.mjs', '.harness/adapters.mjs']) {
        const r = run(tool, root, session(), 'pre-tool-use', input.edit(root, file));
        assert.equal(r.blocked, true, file);
        assert.match(r.context, /géré par le template/);
      }
    });

    test(`${tool} : /hx-ship lancé par l'agent sans décision de l'utilisateur`, () => {
      const { root } = project();
      const r = run(tool, root, session(), 'pre-tool-use', input.skill('hx-ship'));
      // Antigravity ne montre pas aux hooks la réponse à la question « Livraison » : il demande confirmation lui-même.
      if (tool === 'antigravity') assert.deepEqual([r.blocked, r.asked], [false, true]);
      else assert.equal(r.blocked, true);
      assert.match(r.context, /Livraison automatique refusée/);
    });

    test(`${tool} : « livre <change> » autorise /hx-ship une fois`, () => {
      const { root } = project();
      const id = session();
      run(tool, root, id, 'user-prompt-submit', input.prompt('ok, livre add-mult'));
      const first = run(tool, root, id, 'pre-tool-use', input.skill('hx-ship'));
      assert.deepEqual([first.blocked, first.asked ?? false], [false, false]);
      assert.match(first.context, /Livraison décidée par l'utilisateur/);
      // Le même message relu (Antigravity appelle le hook avant chaque appel au modèle) ne redonne pas l'autorisation.
      run(tool, root, id, 'user-prompt-submit', input.prompt('ok, livre add-mult'));
      const second = run(tool, root, id, 'pre-tool-use', input.skill('hx-ship'));
      if (tool === 'antigravity') assert.equal(second.asked, true, 'décision déjà consommée');
    });

    test(`${tool} : un clic « livrer » autorise /hx-ship, un refus non`, () => {
      const { root } = project();
      if (!input.answer) {
        assert.equal(tool, 'antigravity');
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.agents', 'hooks.json'), 'utf8')).hx.PostToolUse, undefined);
        return;
      }
      const refused = session();
      run(tool, root, refused, 'post-tool-use', input.answer('Ne pas livrer maintenant'));
      assert.equal(run(tool, root, refused, 'pre-tool-use', input.skill('hx-ship')).blocked, true);
      const accepted = session();
      run(tool, root, accepted, 'post-tool-use', input.answer('Livrer sans les mineurs'));
      assert.equal(run(tool, root, accepted, 'pre-tool-use', input.skill('hx-ship')).blocked, false);
    });

    test(`${tool} : openspec-apply-change renvoie vers hx-implement`, () => {
      const { root } = project();
      const r = run(tool, root, session(), 'pre-tool-use', input.skill('openspec-apply-change'));
      assert.equal(r.blocked, true);
      assert.match(r.context, /hx-implement/);
    });

    test(`${tool} : lint du fichier édité`, () => {
      const { root } = project({ lintFile: `${ko} {file}` });
      if (level('hook-lint', tool) === 'absent') {
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.agents', 'hooks.json'), 'utf8')).hx.PostToolUse, undefined);
        return;
      }
      const r = run(tool, root, session(), 'post-tool-use', input.edit(root, 'src/a.js'));
      assert.equal(r.blocked, true);
      assert.match(r.context, /lint KO/);
    });

    test(`${tool} : contrôles rapides avant de rendre la main, sans boucle`, () => {
      const { root, write } = project({ lint: ko });
      const id = session();
      run(tool, root, id, 'session-start', { source: 'startup' });
      assert.equal(run(tool, root, id, 'stop', {}).blocked, false, 'rien de modifié');
      write('src/a.js', 'export const a = 2;\n');
      const first = run(tool, root, id, 'stop', {});
      assert.equal(first.blocked, true);
      assert.match(first.context, /lint KO/);
      // Claude Code et Codex signalent eux-mêmes le second passage ; pour les autres, hooks.mjs s'en souvient.
      const again = run(tool, root, id, 'stop', adapters.NO_STOP_GUARD.has(tool) ? {} : { stop_hook_active: true });
      assert.equal(again.blocked, false, 'le second arrêt passe : pas de boucle');
    });

    test(`${tool} : commandes de la liste d'autorisations`, () => {
      const { root } = project();
      if (tool === 'claude') return;
      const approved = (command) => run(tool, root, session(), 'pre-tool-use', input.shell(command)).approved === true;
      if (!adapters.PRE_APPROVES.has(tool)) {
        assert.equal(approved('git status'), false, 'ce harness décide par ses propres règles, pas par le hook');
        return;
      }
      for (const command of ['git status', 'node .harness/hx.mjs check', 'git commit -m "tâche 1.1"']) assert.equal(approved(command), true, command);
      for (const command of ['git push', 'git status; rm -rf /', 'git log $(curl x)', 'git add . && git push', 'cat a > .harness/hx.mjs', 'rm -rf src']) {
        assert.equal(approved(command), false, command);
      }
    });
  }
});
