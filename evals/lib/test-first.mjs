// Test d'abord : dans le transcript stream-json, la première écriture d'un test précède la première écriture du code.
// Usage : node test-first.mjs <transcript.jsonl> <regex du code> <regex des tests>
// Écritures comptées : outils Write, Edit, MultiEdit, NotebookEdit, et commandes Bash (redirection, tee, cp, mv, sed -i).
// Une commande Bash qui touche les deux à la fois compte comme du code (prudence).
import fs from 'node:fs';

const [file, codeArg, testArg] = process.argv.slice(2);
if (!file || !codeArg || !testArg) {
  console.error('usage : node test-first.mjs <transcript.jsonl> <regex du code> <regex des tests>');
  process.exit(2);
}
const code = new RegExp(codeArg);
const test = new RegExp(testArg);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const REDIRECT = /(?:^|[^<>&0-9])>{1,2}\s*([^\s;&|<>]+)|\btee\s+(?:-a\s+)?([^\s;&|<>]+)/g;
const COPY = /\b(cp|mv)\b|\bsed\s+-i/;

// Cibles écrites par une commande shell : fichiers redirigés ou passés à tee ; commande entière pour cp, mv, sed -i.
function shellTargets(command) {
  const targets = [...command.matchAll(REDIRECT)].map((m) => m[1] ?? m[2]).filter((t) => t !== '/dev/null');
  if (COPY.test(command)) targets.push(command);
  return targets.join(' ');
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
      const target = shellTargets(String(input.command ?? ''));
      if (target) writes.push({ tool: 'Bash', target });
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
