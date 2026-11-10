#!/usr/bin/env node
// Adaptateurs du harness pour Codex, OpenCode, Antigravity et DeepSeek Harness.
// Fichier géré par le template Harness : les améliorations se font dans Harness, puis `copier update`.
//
// Une seule source : CLAUDE.md, .claude/ (skills, agents, rules, settings.json) et .harness/project.md.
// Les fichiers des autres harness en sont générés (`hx adapters`), jamais édités à la main.
// Trois parties : lecture de la source, génération par harness, traduction des hooks (entrée et sortie).
// Aucune dépendance, aucun import de hx.mjs ni de hooks.mjs.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST = '.harness/adapters.json';
const NOTE = 'Généré par `node .harness/hx.mjs adapters` depuis CLAUDE.md et .claude/ : ne pas éditer, relancer la commande.';
const HOOK_EVENTS = { SessionStart: 'session-start', UserPromptSubmit: 'user-prompt-submit', PreToolUse: 'pre-tool-use', PostToolUse: 'post-tool-use', Stop: 'stop' };
const SKILL_FILE = /skills[\\/]([a-z0-9][a-z0-9-]*)[\\/]SKILL\.md/i;

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return '';
  }
};

// Frontmatter YAML minimal : clés de premier niveau, valeurs scalaires ou listes « - x ».
export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
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

function walk(dir, base = dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const names = (dir, keep) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(keep).map((e) => e.name).sort();
  } catch {
    return [];
  }
};

// Sous-dossier du dépôt git où vit le harness (« » à la racine) : les hooks Codex partent de la racine git.
function gitPrefix(root) {
  const r = spawnSync('git', ['rev-parse', '--show-prefix'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

export function readSource(root) {
  const claude = path.join(root, '.claude');
  let settings = {};
  try {
    settings = JSON.parse(readText(path.join(claude, 'settings.json')) || '{}');
  } catch {
    settings = {};
  }
  const inner = (rule, kind) => (rule.startsWith(`${kind}(`) && rule.endsWith(')') ? rule.slice(kind.length + 1, -1) : null);
  const hooks = {};
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const group = (groups ?? []).find((g) => (g.hooks ?? []).some((h) => String(h.command ?? '').includes('.harness/hooks.mjs')));
    if (group && HOOK_EVENTS[event]) hooks[event] = { matcher: group.matcher ?? '', timeout: group.hooks[0].timeout ?? null };
  }
  return {
    root,
    prefix: gitPrefix(root),
    instructions: readText(path.join(root, 'CLAUDE.md')),
    project: readText(path.join(root, '.harness', 'project.md')),
    // Les skills openspec-* sont installés par OpenSpec lui-même, dans le dossier de chaque harness.
    skills: names(path.join(claude, 'skills'), (e) => e.isDirectory() && !e.name.startsWith('openspec-')).map((name) => {
      const dir = path.join(claude, 'skills', name);
      return { name, dir, files: walk(dir), data: frontmatter(readText(path.join(dir, 'SKILL.md'))).data };
    }).filter((s) => s.files.includes('SKILL.md')),
    agents: names(path.join(claude, 'agents'), (e) => e.isFile() && e.name.endsWith('.md')).map((file) => {
      const { data, body } = frontmatter(readText(path.join(claude, 'agents', file)));
      const tools = String(data.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
      return { name: file.replace(/\.md$/, ''), description: String(data.description ?? ''), tools, model: data.model ?? null, body, readOnly: !tools.some((t) => t === 'Edit' || t === 'Write') };
    }),
    rules: names(path.join(claude, 'rules'), (e) => e.isFile() && e.name.endsWith('.md')).map((file) => {
      const { data, body } = frontmatter(readText(path.join(claude, 'rules', file)));
      return { name: file.replace(/\.md$/, ''), paths: Array.isArray(data.paths) ? data.paths : [], body };
    }),
    allow: (settings.permissions?.allow ?? []).map((r) => inner(r, 'Bash')).filter(Boolean),
    deny: (settings.permissions?.deny ?? []).map((r) => inner(r, 'Edit')).filter(Boolean).map((p) => p.replace(/^\//, '')),
    env: settings.env ?? {},
    hooks,
  };
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const command = (tool, event, prefix) => `node ${prefix}.harness/hooks.mjs ${HOOK_EVENTS[event]} --tool ${tool}`;
const seconds = (source, event) => (source.hooks[event].timeout ? { timeout: source.hooks[event].timeout } : {});

// Copie des skills dans .agents/skills (Codex, Antigravity, DeepSeek Harness). « $ARGUMENTS » n'est remplacé que par Claude Code.
function sharedSkills(source) {
  const out = {};
  for (const skill of source.skills) {
    for (const rel of skill.files) {
      const file = path.join(skill.dir, rel);
      out[`.agents/skills/${skill.name}/${rel}`] = rel === 'SKILL.md'
        ? readText(file).replace(/`?\$ARGUMENTS`?/g, 'l\'argument donné avec la demande')
        : fs.readFileSync(file);
    }
  }
  return out;
}

// Liste d'autorisations Claude (« X », « X * ») en préfixes de jetons. « X » seul, sans « X * », n'a pas d'équivalent
// en préfixe (il autoriserait aussi les arguments) : il est écarté, sauf si tous ses jetons sont déjà des options fixes.
export function prefixRules(allow) {
  const starred = new Set(allow.filter((p) => p.endsWith(' *')).map((p) => p.slice(0, -2)));
  const kept = new Set();
  const dropped = [];
  for (const pattern of allow) {
    const base = pattern.endsWith(' *') ? pattern.slice(0, -2) : pattern;
    if (base.includes('*')) dropped.push(pattern);
    else if (pattern.endsWith(' *') || starred.has(base) || /\s--?\w/.test(base) || base.split(' ').length > 2) kept.add(base);
    else dropped.push(pattern);
  }
  return { rules: [...kept].sort().map((base) => base.split(' ')), dropped };
}

const tomlString = (text) => `"""\n${text.replace(/\\/g, '\\\\').replace(/"""/g, '""\\"')}"""`;

function codexFiles(source) {
  const out = { ...sharedSkills(source) };
  for (const agent of source.agents) {
    out[`.codex/agents/${agent.name}.toml`] = [
      `# ${NOTE}`,
      `name = ${JSON.stringify(agent.name.replace(/-/g, '_'))}`,
      `description = ${JSON.stringify(agent.description)}`,
      `developer_instructions = ${tomlString(agent.body.replace(/^\n+/, ''))}`,
      '',
    ].join('\n');
  }
  const matchers = { PreToolUse: 'apply_patch|Edit|Write|Bash', PostToolUse: 'apply_patch|Edit|Write|request_user_input' };
  const hooks = {};
  for (const event of Object.keys(source.hooks)) {
    hooks[event] = [{
      ...(matchers[event] ? { matcher: matchers[event] } : {}),
      // Le cwd d'un hook Codex est celui de la session, pas la racine : on part de la racine git (celle du worktree).
      hooks: [{ type: 'command', command: `node "$(git rev-parse --show-toplevel)/${source.prefix}.harness/hooks.mjs" ${HOOK_EVENTS[event]} --tool codex`, ...seconds(source, event) }],
    }];
  }
  if (Object.keys(hooks).length) out['.codex/hooks.json'] = json({ hooks });
  const { rules } = prefixRules(source.allow);
  if (rules.length) {
    out['.codex/rules/harness.rules'] = [
      `# ${NOTE}`,
      ...rules.map((tokens) => `prefix_rule(pattern = ${JSON.stringify(tokens).replace(/,/g, ', ')}, decision = "allow")`),
      '',
    ].join('\n');
  }
  return out;
}

const OPENCODE_EDIT_TOOLS = ['edit', 'write', 'apply_patch', 'patch'];

function opencodePlugin(source) {
  const before = JSON.stringify([...OPENCODE_EDIT_TOOLS, 'skill']);
  const after = JSON.stringify([...OPENCODE_EDIT_TOOLS, 'question']);
  return `// ${NOTE}
// Pont entre OpenCode (V1 >= 1.18.29 et V2) et .harness/hooks.mjs : mêmes contrôles que sous Claude Code.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ENV = ${JSON.stringify(source.env)};
const BEFORE = new Set(${before});
const AFTER = new Set(${after});

function findRoot(dir) {
  for (let current = path.resolve(dir); ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.harness', 'hooks.mjs'))) return current;
    if (path.dirname(current) === current) return null;
  }
}

function hook(root, event, payload) {
  const r = spawnSync('node', [path.join(root, '.harness', 'hooks.mjs'), event, '--tool', 'opencode'], {
    cwd: root, input: JSON.stringify({ cwd: root, ...payload }), encoding: 'utf8', timeout: 600000,
  });
  try {
    return JSON.parse(r.stdout || '{}');
  } catch {
    return {};
  }
}

function bridge(root, say) {
  const notes = new Map();
  const children = new Set();
  return {
    async created(id, parent) {
      if (parent) return void children.add(id);
      const r = hook(root, 'session-start', { session_id: id, source: 'startup' });
      if (r.context) await say(id, r.context, true);
    },
    async idle(id) {
      if (children.has(id)) return;
      const r = hook(root, 'stop', { session_id: id });
      if (r.block) await say(id, r.block, false);
    },
    prompt(id, text) {
      hook(root, 'user-prompt-submit', { session_id: id, prompt: text });
    },
    before(id, call, tool, args) {
      if (!BEFORE.has(tool)) return;
      const r = hook(root, 'pre-tool-use', { session_id: id, tool, args });
      if (r.block) throw new Error(r.block);
      if (r.context) notes.set(call, r.context);
    },
    after(id, call, tool, args, response) {
      const note = notes.get(call);
      notes.delete(call);
      const r = AFTER.has(tool) ? hook(root, 'post-tool-use', { session_id: id, tool, args, response }) : {};
      return [note, r.block].filter(Boolean).join('\\n\\n');
    },
  };
}

export default {
  id: 'hx-harness',

  // OpenCode V2
  async setup(ctx) {
    const root = findRoot(ctx.location.directory);
    if (!root) return;
    const mine = new Set();
    const b = bridge(root, async (sessionID, text, quiet) => {
      mine.add(text);
      await (quiet ? ctx.session.synthetic({ sessionID, text }) : ctx.session.prompt({ sessionID, text })).catch(() => {});
    });
    await ctx.tool.hook('execute.before', (e) => b.before(e.sessionID, e.id, e.tool, e.input ?? {}));
    await ctx.tool.hook('execute.after', (e) => {
      const extra = b.after(e.sessionID, e.id, e.tool, e.input ?? {}, e.result?.output ?? e.result?.content ?? e.error?.message ?? '');
      if (!extra || e.status !== 'completed' || !e.result) return;
      if (typeof e.result.output === 'string') e.result.output += \`\\n\\n\${extra}\`;
      if (Array.isArray(e.result.content)) e.result.content.push({ type: 'text', text: extra });
    });
    await ctx.session.hook('prompt', (e) => {
      const text = e.prompt?.text ?? '';
      if (!mine.delete(text)) b.prompt(e.sessionID, text);
    });
    await ctx.shell.hook('create.before', (e) => {
      Object.assign(e.env, ENV);
    });
    const controller = new AbortController();
    void (async () => {
      for await (const ev of ctx.event.subscribe({ types: ['session.created', 'session.execution.succeeded'], signal: controller.signal })) {
        const data = ev.data ?? ev.properties ?? ev;
        if (!data.sessionID) continue;
        if (ev.type === 'session.created') await b.created(data.sessionID, data.parentID);
        else await b.idle(data.sessionID);
      }
    })().catch(() => {});
    return () => controller.abort();
  },

  // OpenCode V1
  async server({ client, directory }) {
    const root = findRoot(directory);
    if (!root) return {};
    const mine = new Set();
    const b = bridge(root, async (id, text, quiet) => {
      mine.add(text);
      await client.session.prompt({ path: { id }, body: { noReply: quiet, parts: [{ type: 'text', text }] } }).catch(() => {});
    });
    return {
      event: async ({ event }) => {
        const p = event.properties ?? {};
        if (event.type === 'session.created' && p.info?.id) await b.created(p.info.id, p.info.parentID);
        if (event.type === 'session.idle' && p.sessionID) await b.idle(p.sessionID);
      },
      'chat.message': async (input, output) => {
        const text = (output.parts ?? []).filter((part) => part.type === 'text' && !part.synthetic).map((part) => part.text).join('\\n');
        if (!mine.delete(text)) b.prompt(input.sessionID, text);
      },
      'tool.execute.before': async (input, output) => b.before(input.sessionID, input.callID, input.tool, output.args ?? {}),
      'tool.execute.after': async (input, output) => {
        const extra = b.after(input.sessionID, input.callID, input.tool, input.args ?? {}, output.output ?? '');
        if (extra) output.output = \`\${output.output ?? ''}\\n\\n\${extra}\`;
      },
      'shell.env': async (_input, output) => {
        Object.assign(output.env, ENV);
      },
    };
  },
};
`;
}

function opencodeFiles(source) {
  const out = {};
  // Format V1 des agents et des permissions : lu tel quel par la V1, repris par la V2 (champs « legacy »).
  for (const agent of source.agents) {
    out[`.opencode/agents/${agent.name}.md`] = [
      '---',
      `description: ${JSON.stringify(agent.description)}`,
      'mode: subagent',
      ...(agent.readOnly ? ['permission:', '  edit: deny'] : []),
      '---',
      `<!-- ${NOTE} -->`,
      agent.body.replace(/^\n+/, ''),
    ].join('\n');
  }
  const permission = {};
  if (source.allow.length) permission.bash = Object.fromEntries(source.allow.map((p) => [p, 'allow']));
  if (source.deny.length) permission.edit = Object.fromEntries(source.deny.map((p) => [p, 'deny']));
  out['.opencode/opencode.json'] = json({ $schema: 'https://opencode.ai/config.json', permission });
  if (Object.keys(source.hooks).length) out['.opencode/plugins/hx-harness.js'] = opencodePlugin(source);
  return out;
}

const ANTIGRAVITY_TOOLS = {
  Read: ['view_file', 'list_dir'],
  Grep: ['grep_search'],
  Glob: ['find_by_name'],
  Bash: ['run_command'],
  Edit: ['replace_file_content', 'multi_replace_file_content'],
  Write: ['write_to_file'],
  WebSearch: ['search_web'],
  WebFetch: ['read_url_content'],
};
const ANTIGRAVITY_MODELS = { haiku: 'flash' };
const ANTIGRAVITY_EDITS = 'write_to_file|replace_file_content|multi_replace_file_content';

function antigravityFiles(source) {
  const out = { ...sharedSkills(source) };
  for (const rule of source.rules) {
    out[`.agents/rules/${rule.name}.md`] = [
      '---',
      ...(rule.paths.length ? ['trigger: glob', `globs: ${JSON.stringify(rule.paths.join(', '))}`] : ['trigger: always_on']),
      '---',
      `<!-- ${NOTE} -->`,
      rule.body.replace(/^\n+/, ''),
    ].join('\n');
  }
  for (const agent of source.agents) {
    const tools = [...new Set(agent.tools.flatMap((t) => ANTIGRAVITY_TOOLS[t] ?? []))];
    out[`.agents/agents/${agent.name}.md`] = [
      '---',
      `name: ${agent.name}`,
      `description: ${JSON.stringify(agent.description)}`,
      `tools: [${tools.join(', ')}]`,
      'mainAgent: false',
      ...(ANTIGRAVITY_MODELS[agent.model] ? [`model: ${ANTIGRAVITY_MODELS[agent.model]}`] : []),
      '---',
      `<!-- ${NOTE} -->`,
      agent.body.replace(/^\n+/, ''),
    ].join('\n');
  }
  // Pas de PostToolUse : il ne peut rien renvoyer à l'agent (le lint du fichier édité passe par Stop).
  // PreInvocation (avant chaque appel au modèle) tient lieu de UserPromptSubmit, dédoublonné côté hooks.mjs.
  const events = { SessionStart: 'SessionStart', UserPromptSubmit: 'PreInvocation', PreToolUse: 'PreToolUse', Stop: 'Stop' };
  const group = { enabled: true };
  for (const [event, target] of Object.entries(events)) {
    if (!source.hooks[event]) continue;
    const handler = { type: 'command', command: command('antigravity', event, ''), ...seconds(source, event) };
    group[target] = event === 'PreToolUse' ? [{ matcher: `${ANTIGRAVITY_EDITS}|view_file|run_command`, hooks: [handler] }] : [handler];
  }
  if (Object.keys(group).length > 1) out['.agents/hooks.json'] = json({ hx: group });
  return out;
}

function dshFiles(source) {
  const out = { ...sharedSkills(source) };
  if (!Object.keys(source.hooks).length) return out;
  // Format des hooks Claude Code, lu par le pont @deepseek-ai/dsh-hooks-claude-code ; noms d'outils de dsh, en minuscules.
  const matchers = { PreToolUse: 'edit|write|apply_patch|skill', PostToolUse: 'edit|write|apply_patch|ask_user_question' };
  const hooks = {};
  for (const event of Object.keys(source.hooks)) {
    hooks[event] = [{
      ...(matchers[event] ? { matcher: matchers[event] } : {}),
      hooks: [{ type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.harness/hooks.mjs" ${HOOK_EVENTS[event]} --tool dsh`, ...seconds(source, event) }],
    }];
  }
  out['.dsh/hooks.json'] = json({ hooks });
  out['.dsh/harness.patch.yml'] = [
    `# ${NOTE}`,
    '# À passer au lancement, depuis la racine du projet : dsh --patch .dsh/harness.patch.yml',
    '# AGENTS.md seul : il reprend CLAUDE.md, que dsh lirait sinon en double.',
    '- id: agent-instructions',
    '  config:',
    "    instructionFileCandidates: ['AGENTS.md']",
    '- insert:',
    "    - name: '@deepseek-ai/dsh-hooks-claude-code'",
    '      config:',
    '        configPath: ./.dsh/hooks.json',
    '        projectDir: .',
    '',
  ].join('\n');
  return out;
}

// Ce que chaque harness appelle autrement : repris dans AGENTS.md, pour que skills et consignes restent ceux de Claude Code.
export const TOOLS = {
  codex: {
    label: 'Codex',
    files: codexFiles,
    terms: {
      skill: '`$hx-…` (dossier `.agents/skills/`)',
      opsx: '`$openspec-…` (`$openspec-propose`, `$openspec-apply-change`…)',
      agent: 'outil `spawn_agent`, agent `hx_…` (tiret remplacé par un souligné : `hx_explorer`)',
      ask: '`request_user_input` s\'il est disponible, sinon la question en texte avec les mêmes choix numérotés',
      worktree: 'lance les commandes suivantes depuis le dossier du worktree (`workdir`), sans changer de session',
      auto: 'politique d\'approbation de la session (`approval_policy`)',
    },
  },
  opencode: {
    label: 'OpenCode',
    files: opencodeFiles,
    terms: {
      skill: 'outil `skill` (dossier `.claude/skills/`, lu nativement)',
      opsx: '`/opsx-…` (`/opsx-propose`, `/opsx-apply`…)',
      agent: 'sous-agent `hx-…` (`@hx-…`, outil `task` ou `subagent`)',
      ask: 'outil `question`',
      worktree: 'lance les commandes suivantes depuis le dossier du worktree (`workdir`), sans changer de session',
      auto: 'permissions de `.opencode/opencode.json`',
    },
  },
  antigravity: {
    label: 'Antigravity',
    files: antigravityFiles,
    terms: {
      skill: '`/hx-…` (dossier `.agents/skills/`)',
      opsx: '`/opsx-…` (`/opsx-propose`, `/opsx-apply`…)',
      agent: 'outil `invoke_subagent`, type `hx-…`',
      ask: 'outil `ask_question`',
      worktree: 'lance les commandes suivantes depuis le dossier du worktree (`Cwd`), sans changer de session',
      auto: 'mode de la conversation (Auto)',
    },
  },
  dsh: {
    label: 'DeepSeek Harness',
    files: dshFiles,
    terms: {
      skill: 'outil `skill` (dossier `.agents/skills/`)',
      opsx: '`/openspec-…` (`/openspec-propose`, `/openspec-apply-change`…)',
      agent: 'outil `subagent`, avec pour consigne le contenu de `.claude/agents/hx-….md` suivi de la tâche',
      ask: 'outil `ask_user_question`',
      worktree: 'outil `create_worktree` s\'il est activé, sinon lance les commandes depuis le dossier du worktree (`workdir`)',
      auto: 'préréglage de permissions (`/permission`)',
    },
  },
};
export const TOOL_IDS = Object.keys(TOOLS);

const TERMS = [
  ['skill', 'Un skill `hx-…`, ou `/hx-…`'],
  ['opsx', 'Une commande `/opsx:…`'],
  ['agent', 'Un sous-agent `hx-…`'],
  ['ask', 'L\'outil AskUserQuestion (choix cliquable)'],
  ['worktree', 'L\'outil EnterWorktree'],
  ['auto', 'Le mode Auto'],
];

// AGENTS.md : CLAUDE.md avec la carte du projet recopiée (aucun de ces harness ne suit l'import « @fichier »),
// puis les équivalences d'outils et les rules, qu'un harness sans ciblage par chemin doit aller lire lui-même.
function agentsMd(source, tools) {
  const project = source.project.replace(/^<!--[\s\S]*?-->\n?/, (m) => (m.includes('hx:todo') ? m : '')).trim();
  const body = source.instructions
    .replace(/^# Instructions pour Claude$/m, '# Instructions pour l\'agent')
    .replace(/, importé ci-dessous\./, ', recopié ci-dessous.')
    .replace(/^@\.harness\/project\.md$/m, project.replace(/^#/gm, '##') || '(carte du projet absente : `.harness/project.md`)');
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const lines = [
    `<!-- ${NOTE} -->`,
    body.trimEnd(),
    '',
    '## Hors de Claude Code : équivalences',
    '',
    'Ces consignes et les skills sont écrits pour Claude Code. Quand ils nomment un de ses outils, utilise l\'équivalent de ton harness. Si l\'équivalent manque, fais la même chose en texte, sans sauter l\'étape.',
    '',
    row(['Les consignes disent', ...tools.map((t) => TOOLS[t].label)]),
    row(['---', ...tools.map(() => '---')]),
    ...TERMS.map(([key, label]) => row([label, ...tools.map((t) => TOOLS[t].terms[key])])),
  ];
  if (source.rules.length) {
    lines.push(
      '',
      '## Règles par type de fichier',
      '',
      'Avant de créer ou de modifier un fichier, lis la règle qui le concerne (une fois par session).',
      '',
      row(['Règle', 'Fichiers concernés']),
      row(['---', '---']),
      ...source.rules.map((r) => row([`\`.claude/rules/${r.name}.md\``, r.paths.length ? r.paths.map((p) => `\`${p}\``).join(' ') : 'tous'])),
    );
  }
  return `${lines.join('\n')}\n`;
}

export function validTools(list) {
  const tools = [...new Set(list)].filter((t) => t !== 'claude');
  const unknown = tools.filter((t) => !TOOLS[t]);
  if (unknown.length) throw new Error(`harness inconnu : ${unknown.join(', ')} (connus : ${TOOL_IDS.join(', ')})`);
  return TOOL_IDS.filter((t) => tools.includes(t));
}

// Fichiers à écrire pour ces harness : { chemin relatif: contenu (texte ou Buffer) }.
export function generate(root, tools, source = readSource(root)) {
  const out = {};
  if (!tools.length) return out;
  out['AGENTS.md'] = agentsMd(source, tools);
  for (const tool of tools) Object.assign(out, TOOLS[tool].files(source));
  return out;
}

export function readManifest(root) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'));
    return { tools: Array.isArray(manifest.tools) ? manifest.tools : [], files: Array.isArray(manifest.files) ? manifest.files : [] };
  } catch {
    return { tools: [], files: [] };
  }
}

// Comparaison sans les fins de ligne : sous Windows, git peut rendre les fichiers texte en CRLF.
const lf = (content) => (typeof content === 'string' || !content.includes(0) ? content.toString('utf8').replace(/\r\n/g, '\n') : content);
const same = (file, content) => {
  try {
    const [current, wanted] = [lf(fs.readFileSync(file)), lf(content)];
    return typeof wanted === 'string' ? current === wanted : Buffer.isBuffer(current) && current.equals(wanted);
  } catch {
    return false;
  }
};

// Écarts entre le disque et ce que la source génère : fichiers à écrire, fichiers périmés à retirer, et
// fichiers existants que le harness n'a pas écrits (jamais écrasés sans --force).
export function plan(root, tools = readManifest(root).tools) {
  const files = generate(root, tools);
  const previous = new Set(readManifest(root).files);
  const write = Object.keys(files).filter((rel) => !same(path.join(root, rel), files[rel]));
  return {
    tools,
    files,
    write,
    remove: [...previous].filter((rel) => !(rel in files) && fs.existsSync(path.join(root, rel))),
    foreign: write.filter((rel) => !previous.has(rel) && fs.existsSync(path.join(root, rel))),
  };
}

function removeEmptyParents(root, rel) {
  for (let dir = path.dirname(path.join(root, rel)); dir.startsWith(root) && dir !== root; dir = path.dirname(dir)) {
    try {
      fs.rmdirSync(dir);
    } catch {
      return;
    }
  }
}

export function sync(root, tools, { force = false } = {}) {
  const p = plan(root, tools);
  if (p.foreign.length && !force) return { ...p, ok: false };
  for (const rel of p.write) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), p.files[rel]);
  }
  for (const rel of p.remove) {
    fs.rmSync(path.join(root, rel), { force: true });
    removeEmptyParents(root, rel);
  }
  const manifest = path.join(root, MANIFEST);
  if (tools.length) fs.writeFileSync(manifest, json({ tools, files: Object.keys(p.files).sort() }));
  else fs.rmSync(manifest, { force: true });
  return { ...p, ok: true };
}

// ---------------------------------------------------------------------------
// Parité : ce que chaque harness obtient, capacité par capacité
// ---------------------------------------------------------------------------

export const LEVELS = { natif: 1, équivalent: 1, dégradé: 0.5, absent: 0 };
const N = 'natif';
const E = 'équivalent';
const D = 'dégradé';
const A = 'absent';

// Chaque capacité du harness, son niveau par harness et pourquoi. `proof` nomme ce que tests/parity.test.mjs vérifie :
// un fichier généré (structure) ou un scénario de hook rejoué dans le protocole du harness (comportement).
export const CAPABILITIES = [
  { id: 'instructions', label: 'Consignes du projet', claude: 'CLAUDE.md',
    codex: [E, 'AGENTS.md généré'], opencode: [E, 'AGENTS.md généré'], antigravity: [E, 'AGENTS.md généré'], dsh: [E, 'AGENTS.md généré, CLAUDE.md écarté par le patch'] },
  { id: 'project-map', label: 'Carte du projet', claude: 'import `@.harness/project.md`',
    codex: [E, 'recopiée dans AGENTS.md'], opencode: [E, 'recopiée dans AGENTS.md'], antigravity: [E, 'recopiée dans AGENTS.md'], dsh: [E, 'recopiée dans AGENTS.md'] },
  { id: 'skills', label: 'Skills', claude: '`.claude/skills/`',
    codex: [N, '`.agents/skills/`'], opencode: [N, 'lit `.claude/skills/`'], antigravity: [N, '`.agents/skills/`'], dsh: [N, '`.agents/skills/`'] },
  { id: 'skills-on-demand', label: 'Skills lancés seulement à la demande', claude: '`disable-model-invocation`',
    codex: [D, 'champ ignoré : la description dit « à la demande »'], opencode: [N, 'champ reconnu (V2) ; ignoré en V1'], antigravity: [D, 'champ ignoré : la description dit « à la demande »'], dsh: [N, 'champ reconnu'] },
  { id: 'agents', label: 'Sous-agents', claude: '`.claude/agents/*.md`',
    codex: [E, '`.codex/agents/*.toml`'], opencode: [E, '`.opencode/agents/*.md`'], antigravity: [E, '`.agents/agents/*.md`'], dsh: [D, 'pas de sous-agent en fichier : outil `subagent` avec la consigne de `.claude/agents/`'] },
  { id: 'agents-read-only', label: 'Sous-agents en lecture seule', claude: 'liste `tools` sans Edit ni Write',
    codex: [D, 'consigne seulement : pas de restriction par agent'], opencode: [E, '`permission.edit: deny`'], antigravity: [E, 'liste `tools` sans outil d\'écriture'], dsh: [D, 'consigne seulement'] },
  { id: 'agents-model', label: 'Modèle léger pour l\'exploration', claude: '`model: haiku`',
    codex: [A, 'modèle de la session'], opencode: [A, 'modèle de la session'], antigravity: [E, '`model: flash`'], dsh: [A, 'modèle de la session'] },
  { id: 'rules', label: 'Rules ciblées par chemin', claude: '`.claude/rules/*.md` (`paths:`)',
    codex: [D, 'index dans AGENTS.md : l\'agent lit la règle lui-même'], opencode: [D, 'index dans AGENTS.md'], antigravity: [N, '`.agents/rules/*.md` (`trigger: glob`)'], dsh: [D, 'index dans AGENTS.md'] },
  { id: 'hook-session-start', label: 'Démarrage : prochaine action de chaque change', claude: 'hook `SessionStart`',
    codex: [N, '`.codex/hooks.json`'], opencode: [E, 'plugin, événement `session.created`'], antigravity: [N, '`.agents/hooks.json`'], dsh: [D, 'pont expérimental ; le contexte peut arriver après la première requête'] },
  { id: 'hook-ship-message', label: '« livre <change> » noté comme une décision', claude: 'hook `UserPromptSubmit`',
    codex: [N, '`.codex/hooks.json`'], opencode: [E, 'plugin, admission du prompt'], antigravity: [E, 'hook `PreInvocation`, dédoublonné'], dsh: [N, 'pont de hooks'] },
  { id: 'hook-protected', label: 'Rappel sur un fichier protégé', claude: 'hook `PreToolUse`',
    codex: [N, '`.codex/hooks.json`'], opencode: [E, 'plugin : note jointe au résultat de l\'outil'], antigravity: [D, 'motif joint à la décision, sans garantie qu\'il atteigne l\'agent'], dsh: [N, 'pont de hooks'] },
  { id: 'hook-ship-guard', label: '`/hx-ship` refusé sans décision ni indice suffisant', claude: 'hook `PreToolUse` sur l\'outil Skill',
    codex: [D, 'pas d\'outil Skill : seule la lecture de `SKILL.md` par le shell est vue'], opencode: [N, 'plugin, outil `skill`'], antigravity: [E, 'lecture de `SKILL.md` vue ; confirmation native demandée à l\'utilisateur'], dsh: [N, 'pont de hooks, outil `skill`'] },
  { id: 'hook-lint', label: 'Lint du fichier édité', claude: 'hook `PostToolUse`',
    codex: [N, '`.codex/hooks.json`'], opencode: [E, 'plugin : retour joint au résultat de l\'outil'], antigravity: [A, '`PostToolUse` ne renvoie rien à l\'agent ; le hook Stop couvre'], dsh: [N, 'pont de hooks'] },
  { id: 'hook-ship-click', label: 'Clic « livrer » noté comme une décision', claude: 'hook `PostToolUse` sur AskUserQuestion',
    codex: [D, '`request_user_input` selon le mode ; sinon message « livre <change> »'], opencode: [E, 'plugin, outil `question`'], antigravity: [E, 'réponse invisible aux hooks : confirmation native au lancement de `/hx-ship`'], dsh: [D, 'réponse en texte libre : notée seulement si un seul choix y figure'] },
  { id: 'hook-stop', label: 'Contrôles rapides avant de rendre la main', claude: 'hook `Stop`',
    codex: [N, '`.codex/hooks.json`'], opencode: [E, 'plugin : nouveau tour si un contrôle échoue'], antigravity: [N, '`.agents/hooks.json`'], dsh: [E, 'pont de hooks, garde anti-boucle dans hooks.mjs'] },
  { id: 'permissions-allow', label: 'Commandes autorisées sans confirmation', claude: '`permissions.allow`',
    codex: [E, '`.codex/rules/harness.rules` (préfixes)'], opencode: [E, '`.opencode/opencode.json`'], antigravity: [E, 'hook `PreToolUse` : `auto_approve` sur les commandes simples'], dsh: [A, 'pas de règle par commande : préréglage de permissions'] },
  { id: 'permissions-deny', label: 'Fichiers du harness non éditables', claude: '`permissions.deny`',
    codex: [E, 'hook `PreToolUse` sur `apply_patch`'], opencode: [E, '`permission.edit` et plugin'], antigravity: [E, 'hook `PreToolUse`'], dsh: [E, 'pont de hooks'] },
  { id: 'env', label: 'Variables d\'environnement de session', claude: '`env` de settings.json',
    codex: [A, 'à poser dans `.codex/config.toml` du projet'], opencode: [E, 'plugin, environnement du shell'], antigravity: [A, 'aucun réglage de projet'], dsh: [A, 'aucun réglage de projet'] },
  { id: 'ask', label: 'Choix cliquables aux arrêts prévus', claude: 'outil AskUserQuestion',
    codex: [D, '`request_user_input` selon le mode, sinon texte'], opencode: [N, 'outil `question`'], antigravity: [N, 'outil `ask_question`'], dsh: [N, 'outil `ask_user_question`'] },
  { id: 'worktree', label: 'Run dans un worktree sans changer de session', claude: 'outil EnterWorktree',
    codex: [D, 'commandes lancées depuis le worktree'], opencode: [D, 'commandes lancées depuis le worktree'], antigravity: [D, 'commandes lancées depuis le worktree'], dsh: [D, '`create_worktree` expérimental, sinon commandes depuis le worktree'] },
  { id: 'openspec', label: 'Commandes OpenSpec', claude: '`/opsx:*`',
    codex: [N, '`$openspec-*`'], opencode: [N, '`/opsx-*`'], antigravity: [N, '`/opsx-*`'], dsh: [N, '`/openspec-*`'] },
];

export function parity(tools = TOOL_IDS) {
  const scores = Object.fromEntries(tools.map((tool) => {
    const total = CAPABILITIES.reduce((sum, c) => sum + LEVELS[c[tool][0]], 0);
    return [tool, Math.round((100 * total) / CAPABILITIES.length)];
  }));
  return { tools, capabilities: CAPABILITIES, scores };
}

const ICONS = { natif: '🟢', équivalent: '🟢', dégradé: '🟡', absent: '🔴' };

export function formatParity(report = parity()) {
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const { tools } = report;
  return [
    row(['Capacité', 'Claude Code', ...tools.map((t) => TOOLS[t].label)]),
    row(['---', '---', ...tools.map(() => '---')]),
    ...report.capabilities.map((c) => row([`**${c.label}**`, `🟢 ${c.claude}`, ...tools.map((t) => `${ICONS[c[t][0]]} ${c[t][0]} · ${c[t][1]}`)])),
    row(['**Score**', '**100 %**', ...tools.map((t) => `**${report.scores[t]} %**`)]),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Hooks : du protocole de chaque harness vers celui de Claude Code, et retour
// ---------------------------------------------------------------------------

const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
};

// Fichiers touchés par un patch « *** Update File: chemin » (apply_patch de Codex, d'OpenCode et de dsh).
export const patchFiles = (text) => [...String(text ?? '').matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((m) => m[1].trim());

const skillRead = (value) => strings(value).map((s) => SKILL_FILE.exec(s)?.[1]).find(Boolean);
const edits = (files) => files.filter(Boolean).map((file) => ({ tool_name: 'Edit', tool_input: { file_path: file } }));

// Question posée à l'utilisateur, ramenée à la forme d'AskUserQuestion. La réponse d'un autre harness est du texte
// libre : un choix n'est retenu que s'il est le seul à y figurer (une réponse qui recopie tous les choix ne décide rien).
function question(args, response) {
  const questions = (Array.isArray(args?.questions) ? args.questions : []).map((q) => ({
    header: q?.header,
    question: q?.question ?? q?.prompt ?? q?.text,
    labels: (q?.options ?? q?.choices ?? []).map((o) => (typeof o === 'string' ? o : o?.label)).filter(Boolean),
  })).filter((q) => q.question);
  const text = typeof response === 'string' ? response : JSON.stringify(response ?? '');
  const answers = {};
  for (const q of questions) {
    const found = q.labels.filter((label) => text.includes(label));
    const longest = found.filter((label) => !found.some((other) => other !== label && other.includes(label)));
    if (longest.length === 1) answers[q.question] = longest[0];
  }
  return [{ tool_name: 'AskUserQuestion', tool_input: { questions: questions.map(({ header, question: text }) => ({ header, question: text })) }, tool_response: { answers } }];
}

// Appels d'outil au format Claude Code (Edit, Skill, AskUserQuestion, Bash) : aucun, un, ou un par fichier d'un patch.
function calls(tool, name, args, response) {
  const input = args ?? {};
  switch (`${tool}:${name}`) {
    case 'codex:apply_patch': case 'codex:Edit': case 'codex:Write':
      return edits(input.file_path ? [input.file_path] : patchFiles(input.command));
    case 'codex:Bash': case 'dsh:bash': case 'dsh:pwsh': {
      const skill = skillRead(input.command);
      return [skill ? { tool_name: 'Skill', tool_input: { skill } } : { tool_name: 'Bash', tool_input: { command: String(input.command ?? '') } }];
    }
    case 'codex:request_user_input': case 'dsh:ask_user_question': case 'opencode:question':
      return question(input, response);
    case 'dsh:edit': case 'dsh:write': case 'opencode:edit': case 'opencode:write':
      return edits([input.file_path ?? input.filePath ?? input.path]);
    case 'dsh:apply_patch': case 'opencode:apply_patch': case 'opencode:patch':
      return edits(strings(input).flatMap(patchFiles));
    case 'dsh:skill': case 'opencode:skill':
      return [{ tool_name: 'Skill', tool_input: { skill: String(input.name ?? input.id ?? ''), args: input.args } }];
    case 'antigravity:write_to_file': case 'antigravity:replace_file_content': case 'antigravity:multi_replace_file_content':
      return edits([input.TargetFile ?? input.AbsolutePath ?? input.Path]);
    case 'antigravity:view_file': {
      const skill = skillRead(input);
      return skill ? [{ tool_name: 'Skill', tool_input: { skill } }] : [];
    }
    case 'antigravity:run_command':
      return [{ tool_name: 'Bash', tool_input: { command: String(input.CommandLine ?? '') } }];
    default:
      return [];
  }
}

// Entrée d'un hook, traduite : champs communs de Claude Code (session_id, cwd, prompt…) et appels d'outil.
export function foreignInput(tool, raw) {
  if (tool === 'antigravity') {
    const base = { session_id: raw.conversationId, cwd: raw.workspacePaths?.[0], prompt: raw.lastUserInput };
    return { base, calls: calls(tool, raw.toolCall?.name, raw.toolCall?.args) };
  }
  if (tool === 'opencode') {
    const { tool: name, args, response, ...base } = raw;
    return { base, calls: calls(tool, name, args, response) };
  }
  const { tool_name: name, tool_input: args, tool_response: response, ...base } = raw;
  return { base, calls: calls(tool, name, args, response) };
}

// Harness qui ne disent pas au hook Stop qu'il a déjà bloqué : hooks.mjs tient le compte lui-même.
export const NO_STOP_GUARD = new Set(['opencode', 'antigravity', 'dsh']);
// Harness dont les hooks peuvent approuver une commande à la place de l'utilisateur.
export const PRE_APPROVES = new Set(['antigravity']);

// Commande couverte par la liste d'autorisations de Claude Code (« X * » : X suivi d'arguments). Toute commande
// composée, redirigée ou avec substitution est écartée : le harness demandera confirmation.
export function preApproved(allow, text) {
  const line = String(text ?? '').trim();
  if (!line || /[;&|`$()<>\n\r\\]/.test(line)) return false;
  return allow.some((rule) => new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/ \*$/, ' .+').replace(/\*/g, '.*')}$`).test(line));
}

// Résultat d'un hook ({ block, ask, approve, context, notice }) dans le protocole du harness : { stdout, stderr, code }.
export function foreignOutput(tool, event, r) {
  const out = (value) => ({ stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '', code: 0 });
  const feedback = { stdout: '', stderr: r.block ?? '', code: 2 };
  if (tool === 'opencode') return out({ block: r.block ?? null, context: r.context ?? null, notice: r.notice ?? null });
  if (tool === 'antigravity') {
    if (event === 'session-start') return out(r.context ? { injectSteps: [{ systemMessage: { systemMessage: r.context } }] } : {});
    if (event === 'stop') return out(r.block ? { decision: 'continue', reason: r.block } : {});
    if (event !== 'pre-tool-use') return out({});
    if (r.block) return out({ decision: r.ask ? 'ask' : 'deny', reason: r.block });
    if (r.approve) return out({ decision: 'auto_approve' });
    return out(r.context ? { decision: 'allow', reason: r.context } : { decision: 'allow' });
  }
  // Codex et dsh (pont) : protocole de Claude Code.
  if (event === 'pre-tool-use') {
    if (r.block) return out({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: r.block } });
    return out(r.context ? { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: r.context } } : '');
  }
  if (r.block) return feedback;
  if (event === 'session-start' && r.context) {
    // Le pont de dsh n'injecte pas la sortie brute : contexte en JSON.
    return out(tool === 'dsh' ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: r.context } } : r.context);
  }
  return out(event === 'stop' && r.notice && tool === 'codex' ? { systemMessage: r.notice } : '');
}
