// Test d'abord : dans le transcript stream-json, la première écriture d'un test précède la première écriture du code.
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

// Cibles écrites par une commande shell, dans l'ordre : fichiers redirigés ou passés à tee ; commande entière pour cp, mv, sed -i.
function shellTargets(raw) {
  const command = withoutHeredocBodies(raw);
  const targets = [...command.matchAll(REDIRECT)].map((m) => m[1] ?? m[2]).filter((t) => t !== '/dev/null');
  if (COPY.test(command)) targets.unshift(command); // en premier : on ne sait pas dans quel ordre ils écrivent
  return targets;
}

const writes = [];
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    continue;
  }
  if (event?.type !== 'assistant') continue;
  for (const block of event.message?.content ?? []) {
    if (block?.type !== 'tool_use') continue;
    const input = block.input ?? {};
    if (WRITE_TOOLS.has(block.name)) writes.push({ tool: block.name, target: String(input.file_path ?? input.notebook_path ?? '') });
    else if (block.name === 'Bash') {
      for (const target of shellTargets(String(input.command ?? ''))) writes.push({ tool: 'Bash', target });
    }
  }
}

const kind = (target) => (code.test(target) ? 'code' : test.test(target) ? 'test' : null);
const relevant = writes.map((w) => ({ ...w, kind: kind(w.target) })).filter((w) => w.kind);
for (const [i, w] of relevant.entries()) console.log(`${i + 1}. ${w.kind.padEnd(4)} ${w.tool} ${w.target.slice(-100)}`);
const firstTest = relevant.findIndex((w) => w.kind === 'test');
const firstCode = relevant.findIndex((w) => w.kind === 'code');
let error = '';
if (firstTest < 0) error = 'aucune écriture de test dans le transcript';
else if (firstCode < 0) error = 'aucune écriture du code dans le transcript';
else if (firstCode < firstTest) error = 'le code est écrit avant le test';
if (error) {
  console.error(`✗ test d'abord : ${error}`);
  process.exit(1);
}
console.log("✓ test d'abord");
