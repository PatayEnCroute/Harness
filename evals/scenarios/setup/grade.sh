# Le projet est personnalisé : carte remplie, profil d'architecture, commande test réelle, contrat vérifié par doctor.
source "$EVAL_LIB/grade.sh"
if grep -q 'hx:todo' .harness/project.md; then fail "carte du projet encore marquée hx:todo"; fi
node -e "
  const c = require('./.harness/config.json');
  const comps = Object.values(c.components ?? {});
  if (!comps.some((x) => x.commands?.test)) throw new Error('aucune commande test');
  if (!c.architecture?.profile?.size || !c.architecture?.profile?.lifespan) throw new Error('profil absent');
"
# Le contrat est écrit par l'agent : la commande test doit vraiment exécuter les tests (pas « true »).
node .harness/hx.mjs run test > /dev/null 2>&1 || fail "hx run test échoue sur le projet intact"
printf '%s\n' "import { test } from 'node:test';" "test('canari des evals', () => { throw new Error('canari'); });" > test/zz-eval-canary.test.js
rc=0
node .harness/hx.mjs run test > /dev/null 2>&1 || rc=$?
rm test/zz-eval-canary.test.js
[ "$rc" -ne 0 ] || fail "hx run test reste vert avec un test en échec : la commande test n'exécute pas les tests"
node .harness/hx.mjs doctor
