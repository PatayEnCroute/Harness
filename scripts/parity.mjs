#!/usr/bin/env node
// Tableau de parité des harness (docs/parite.md), tiré de CAPABILITIES dans template/.harness/adapters.mjs.
// --write : régénère le fichier · --check (défaut) : échoue s'il est périmé ou si un harness passe sous le plancher.
// Les niveaux déclarés sont prouvés par tests/parity.test.mjs. En CI, le tableau part dans le résumé du job.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPABILITIES, TOOLS, formatParity, parity } from '../template/.harness/adapters.mjs';

// Un harness dont plus d'un tiers des capacités manque n'est pas « compatible » : on ne le livre pas ainsi.
const FLOOR = 66;
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'parite.md');
const report = parity();
const count = (tool, level) => CAPABILITIES.filter((c) => c[tool][0] === level).length;
const doc = `# Parité des harness

Ce que le template apporte sous Claude Code, et ce qu'en obtient chaque autre harness.
Fichier généré par \`node scripts/parity.mjs --write\` ; la CI (job \`parity\`) refuse un tableau périmé.

| Niveau | Sens |
|---|---|
| 🟢 natif | même mécanisme que Claude Code |
| 🟢 équivalent | autre mécanisme, même effet (vérifié par \`tests/parity.test.mjs\`) |
| 🟡 dégradé | effet partiel : la raison est donnée |
| 🔴 absent | le harness n'offre pas de point d'accroche |

Score : natif et équivalent comptent 1, dégradé 0,5, absent 0. Plancher : ${FLOOR} %.

${formatParity(report)}

| Harness | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
${report.tools.map((t) => `| ${TOOLS[t].label} | ${count(t, 'natif') + count(t, 'équivalent')} | ${count(t, 'dégradé')} | ${count(t, 'absent')} |`).join('\n')}
`;

if (process.argv.includes('--write')) {
  fs.writeFileSync(file, doc);
  console.log(`docs/parite.md écrit (${report.tools.map((t) => `${TOOLS[t].label} ${report.scores[t]} %`).join(', ')})`);
} else {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Parité des harness\n\n${formatParity(report)}\n`);
  const errors = [];
  let current = '';
  try {
    current = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    current = '';
  }
  if (current !== doc) errors.push('docs/parite.md est périmé : node scripts/parity.mjs --write');
  for (const tool of report.tools) {
    if (report.scores[tool] < FLOOR) errors.push(`${TOOLS[tool].label} : ${report.scores[tool]} %, sous le plancher de ${FLOOR} %`);
  }
  for (const tool of report.tools) console.log(`${errors.length ? ' ' : '✓'} ${TOOLS[tool].label.padEnd(18)} ${report.scores[tool]} %`);
  for (const e of errors) console.error(`✗ ${e}`);
  process.exitCode = errors.length ? 1 : 0;
}
