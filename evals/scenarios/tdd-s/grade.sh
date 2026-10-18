# Piste S : pas de change OpenSpec, test écrit avant le code, test qui détecte un mult faux, hx check vert.
source "$EVAL_LIB/grade.sh"
changes="$(find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive)"
[ -z "$changes" ] || fail "change OpenSpec créé pour un petit changement : $changes"
grep -rqs 'mult' test/ || fail "aucun test ne cite mult"
node --input-type=module -e "
  import { mult } from './src/mult.js';
  if (mult(2, 3) !== 6 || mult(7, 0) !== 0) throw new Error('mult(2, 3) = ' + mult(2, 3) + ', mult(7, 0) = ' + mult(7, 0));
"
node "$EVAL_LIB/test-first.mjs" "$TRANSCRIPT" 'src/mult\.js' '(^|/)test/|\.test\.[cm]?[jt]s'
mutant_caught src/mult.js 'export const mult = () => NaN; export default mult;'
node .harness/hx.mjs check
