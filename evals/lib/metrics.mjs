// Mesures d'une exécution d'eval, lues dans le transcript stream-json de claude -p (un ou plusieurs tours).
// Usage : node metrics.mjs <transcript.jsonl> <result.txt> → JSON sur la sortie standard ; result.txt reçoit la
// réponse du dernier tour. Une mesure absente du transcript vaut null (« non mesuré »), jamais 0.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function metrics(lines) {
  const events = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const results = events.filter((e) => e.type === 'result');
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
  const sum = (values) => (values.length ? values.reduce((n, v) => n + (v ?? 0), 0) : null);

  // modelUsage couvre la session principale et ses sous-agents, par modèle ; usage, la boucle principale seule (repli).
  const usages = results.flatMap((r) => (r.modelUsage ? Object.values(r.modelUsage) : r.usage ? [{
    inputTokens: r.usage.input_tokens, cacheReadInputTokens: r.usage.cache_read_input_tokens,
    cacheCreationInputTokens: r.usage.cache_creation_input_tokens, outputTokens: r.usage.output_tokens,
  }] : []));
  const input = sum(usages.map((u) => (u.inputTokens ?? 0) + (u.cacheReadInputTokens ?? 0) + (u.cacheCreationInputTokens ?? 0)));

  // Pic de contexte : la plus grosse requête de la boucle principale (les sous-agents ont leur propre fenêtre).
  const contexts = events
    .filter((e) => e.type === 'assistant' && !e.parent_tool_use_id && e.message?.usage)
    .map(({ message: { usage: u } }) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0));

  return {
    duration_s: results.length ? Math.round(sum(results.map((r) => r.duration_ms)) / 1000) : null,
    cost_usd: results.length ? Number(sum(results.map((r) => r.total_cost_usd)).toFixed(4)) : null,
    permission_mode: init?.permissionMode ?? null,
    input_tokens: input,
    cache_read_tokens: sum(usages.map((u) => u.cacheReadInputTokens)),
    output_tokens: sum(usages.map((u) => u.outputTokens)),
    peak_context_tokens: contexts.length ? Math.max(...contexts) : null,
    result: results.at(-1)?.result ?? '',
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [transcript, resultFile] = process.argv.slice(2);
  const text = fs.existsSync(transcript) ? fs.readFileSync(transcript, 'utf8') : '';
  const { result, ...measures } = metrics(text.split('\n'));
  if (resultFile) fs.writeFileSync(resultFile, result);
  console.log(JSON.stringify(measures));
}
