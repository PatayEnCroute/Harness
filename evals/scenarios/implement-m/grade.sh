# Toutes les tâches cochées, chaque scénario couvert par un test tagué qui échoue sans le comportement, hx check vert.
source "$EVAL_LIB/grade.sh"
if grep -q -- '- \[ \]' openspec/changes/add-mult/tasks.md; then fail "tâches non cochées"; fi
grep -rqs '@scenario calc/multiply-two-numbers' test/ || fail "tag @scenario calc/multiply-two-numbers absent"
grep -rqs '@scenario calc/multiply-by-zero' test/ || fail "tag @scenario calc/multiply-by-zero absent"
# Comportement vérifié par la notation elle-même, pas seulement par les tests de l'agent.
node --input-type=module -e "
  import { mult } from './src/mult.js';
  if (mult(2, 3) !== 6 || mult(7, 0) !== 0) throw new Error('mult(2, 3) = ' + mult(2, 3) + ', mult(7, 0) = ' + mult(7, 0));
"
# Chaque scénario a un test tagué qui échoue quand seul son comportement est faux.
mutant_caught_by calc/multiply-two-numbers src/mult.js 'export const mult = (a, b) => (b === 0 ? 0 : NaN); export default mult;'
mutant_caught_by calc/multiply-by-zero src/mult.js 'export const mult = (a, b) => (b === 0 ? NaN : a * b); export default mult;'
node .harness/hx.mjs check
