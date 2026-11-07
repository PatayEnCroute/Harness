# Piste S (correctif) : pas de change OpenSpec, test écrit et vu rouge avant le code, test qui détecte le bug, hx check vert.
source "$EVAL_LIB/grade.sh"
changes="$(find openspec/changes -mindepth 1 -maxdepth 1 -type d ! -name archive)"
[ -z "$changes" ] || fail "change OpenSpec créé pour un correctif de piste S : $changes"
grep -rqs 'sumAll' test/ || fail "aucun test ne cite sumAll"
node --input-type=module -e "
  import { sum, sumAll } from './src/sum.js';
  const got = [sumAll([1, 2, 3]), sumAll([]), sumAll([4]), sum(2, 3)];
  if (got.join() !== '6,0,4,5') throw new Error('sumAll([1,2,3]), sumAll([]), sumAll([4]), sum(2,3) = ' + got.join());
"
node "$EVAL_LIB/test-first.mjs" "$TRANSCRIPT" 'src/sum\.js' '(^|/)test/|\.test\.[cm]?[jt]s'
mutant_caught src/sum.js 'export const sum = (a, b) => a + b; export const sumAll = (xs) => xs.slice(1).reduce((total, x) => total + x, 0);'
node .harness/hx.mjs check
