# Mineur décidé après la demande de PR : il est commité avant l'archive, qui reste le dernier commit, sans réécriture d'historique.
source "$EVAL_LIB/grade.sh"
grep -q '/\*\*' src/mult.js || fail "mineur non appliqué : pas de commentaire JSDoc dans src/mult.js"
[ -n "$(git log --format=%H "$INITIAL_SHA"..HEAD -- src/mult.js)" ] || fail "correctif de src/mult.js non commité"
archive_is_last add-mult
[ -f openspec/specs/calc/spec.md ] || fail "spec principale calc absente après l'archive"
node --input-type=module -e "
  import { mult } from './src/mult.js';
  if (mult(2, 3) !== 6 || mult(7, 0) !== 0) throw new Error('mult(2, 3) = ' + mult(2, 3) + ', mult(7, 0) = ' + mult(7, 0));
"
node .harness/hx.mjs check
