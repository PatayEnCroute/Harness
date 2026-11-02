# Score sous le seuil, plafond atteignable : la boucle applique les mineurs, fait relire par des sous-agents neufs,
# puis livre seule. L'archive reste le dernier commit.
source "$EVAL_LIB/grade.sh"
if grep -q 'export default' src/mult.js; then fail "mineur non appliqué : export par défaut dans src/mult.js"; fi
if grep -q 'let result' src/mult.js; then fail "mineur non appliqué : variable result dans src/mult.js"; fi
if grep -q 'assert\.ok' test/mult.test.js; then fail "mineur non appliqué : assert.ok dans test/mult.test.js"; fi
[ -n "$(git log --format=%H "$INITIAL_SHA"..HEAD -- src/mult.js)" ] || fail "mineurs de src/mult.js non commités"
subagent_called hx-code-reviewer
archive_is_last add-mult
meta="$(find openspec/changes/archive -maxdepth 2 -path '*add-mult/.openspec.yaml' | head -n 1)"
[ -n "$meta" ] || fail ".openspec.yaml de add-mult introuvable dans l'archive"
rounds="$(sed -n 's/^x-review-rounds:[[:space:]]*//p' "$meta" | tr -d "\"' \r")"
[ "${rounds:-0}" -ge 2 ] 2>/dev/null || fail "boucle de correction non tracée : x-review-rounds = ${rounds:-absent}"
node --input-type=module -e "
  import { mult } from './src/mult.js';
  if (mult(2, 3) !== 6 || mult(7, 0) !== 0 || mult(-2, 3) !== -6) throw new Error('mult faux : ' + [mult(2, 3), mult(7, 0), mult(-2, 3)]);
"
mutant_caught src/mult.js 'export const mult = (a, b) => a + b;'
node .harness/hx.mjs check
