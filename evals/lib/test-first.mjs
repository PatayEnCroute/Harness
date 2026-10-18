// Test d'abord : dans le transcript stream-json, la première écriture d'un test précède la première écriture du code,
// et un lancement des tests a échoué (rouge) après cette écriture du test, avant le premier lancement au vert.
// Usage : node test-first.mjs <transcript.jsonl> <regex du code> <regex des tests>
// Écritures comptées : outils Write, Edit, MultiEdit, NotebookEdit, et commandes Bash (redirection, tee, cp, mv, sed -i).
// Dans une commande Bash, les redirections comptent dans leur ordre d'exécution (test puis squelette du code : test d'abord).
// cp, mv et sed -i comptent pour la commande entière, avant ses redirections : si elle cite le code, elle compte comme du code (prudence).
import fs from 'node:fs';

const [file, codeArg, testArg] = process.argv.slice(2);
if (!file || !codeArg || !testArg) {
  console.error('usage : node test-first.mjs <transcript.jsonl> <regex du code> <regex des tests>');
  process.exit(2);
}
const code = new RegExp(codeArg);
const test = new RegExp(testArg);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const REDIRECT = /(?:^|[^<>&0-9=-])>{1,2}\s*([^\s;&|<>]+)|\btee\s+(?:-a\s+)?([^\s;&|<>]+)/g;
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1/;

// Le corps d'un heredoc est du contenu, pas du shell : ses « => » ou ses imports ne sont pas des écritures.
function withoutHeredocBodies(command) {
  const kept = [];
  let end = null;
  for (const line of command.split('\n')) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    kept.push(line);
    end = HEREDOC.exec(line)?.[2] ?? null;
  }
  return kept.join('\n');
}
const COPY = /\b(cp|mv)\b|\bsed\s+-i/;
// Lancements de tests reconnus, et marqueurs d'échec dans leur sortie (un « | tail » masque le code de sortie).
const TEST_RUN = /\bhx(?:\.mjs)?\s+(?:run\s+test|check)\b|\bnpm\s+(?:run\s+)?test\b|\bnode\s+--test\b|\bnpx\s+(?:vitest|jest)\b|\bpytest\b/;
const FAILED_OUTPUT = /^not ok \d+|# fail [1-9]|ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError/m;

// Cibles écrites par une commande shell, dans l'ordre : fichiers redirigés ou passés à tee ; commande entière pour cp, mv, sed -i.
function shellTargets(raw) {
  const command = withoutHeredocBodies(raw);
  const targets = [...command.matchAll(REDIRECT)].map((m) => m[1] ?? m[2]).filter((t) => t !== '/dev/null');
  if (COPY.test(command)) targets.unshift(command); // en premier : on ne sait pas dans quel ordre ils écrivent
  return targets;
}

const textOf = (content) => (typeof content === 'string' ? content : (content ?? []).map((c) => c?.text ?? '').join('\n'));

// Événements dans l'ordre des appels d'outils : écritures, et lancements de tests (résultat rattaché par tool_use_id).
const events = [];
const runs = new Map();
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    continue;
  }
  for (const block of event?.message?.content ?? []) {
    if (event.type === 'user' && block?.type === 'tool_result' && runs.has(block.tool_use_id)) {
      const output = textOf(block.content);
      runs.get(block.tool_use_id).red = Boolean(block.is_error) || /^Exit code [1-9]/.test(output) || FAILED_OUTPUT.test(output);
    }
    if (event.type !== 'assistant' || block?.type !== 'tool_use') continue;
    const input = block.input ?? {};
    if (WRITE_TOOLS.has(block.name)) events.push({ tool: block.name, target: String(input.file_path ?? input.notebook_path ?? '') });
    else if (block.name === 'Bash') {
      const command = String(input.command ?? '');
      for (const target of shellTargets(command)) events.push({ tool: 'Bash', target });
      if (TEST_RUN.test(withoutHeredocBodies(command))) {
        const run = { tool: 'Bash', target: command, kind: 'run', red: null };
        runs.set(block.id, run);
        events.push(run);
      }
    }
  }
}

const kind = (target) => (code.test(target) ? 'code' : test.test(target) ? 'test' : null);
const relevant = events.map((e) => (e.kind === 'run' ? e : Object.assign(e, { kind: kind(e.target) }))).filter((e) => e.kind);
const label = (e) => (e.kind === 'run' ? (e.red === null ? 'run ?' : e.red ? 'rouge' : 'vert') : e.kind);
for (const [i, e] of relevant.entries()) console.log(`${i + 1}. ${label(e).padEnd(5)} ${e.tool} ${e.target.replace(/\s+/g, ' ').slice(-100)}`);
const firstTest = relevant.findIndex((e) => e.kind === 'test');
const firstCode = relevant.findIndex((e) => e.kind === 'code');
const after = relevant.slice(firstTest + 1).filter((e) => e.kind === 'run' && e.red !== null);
let error = '';
if (firstTest < 0) error = 'aucune écriture de test dans le transcript';
else if (firstCode < 0) error = 'aucune écriture du code dans le transcript';
else if (firstCode < firstTest) error = 'le code est écrit avant le test';
else if (!after.length || !after[0].red) error = 'aucun lancement des tests au rouge avant le premier vert';
if (error) {
  console.error(`✗ test d'abord : ${error}`);
  process.exit(1);
}
console.log("✓ test d'abord");
