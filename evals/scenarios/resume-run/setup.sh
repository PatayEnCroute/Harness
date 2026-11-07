# Run de add-mult interrompu après la tâche 1.1 : tâche faite, testée, cochée et commitée, son journal écrit.
# L'hypothèse du journal n'existe nulle part ailleurs : le rapport ne peut la citer qu'en relisant run-log.md.
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/configure.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/add-mult-change.sh"
git add -A -- . ':!openspec/changes/add-mult'
git -c user.email=eval@example.com -c user.name=eval commit -qm harness
git checkout -qb add-mult
printf 'export const mult = (a, b) => a * b;\n' > src/mult.js
cat > test/mult.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mult } from '../src/mult.js';

// @scenario calc/multiply-two-numbers
test('mult(2, 3) returns 6', () => {
  assert.equal(mult(2, 3), 6);
});
JS
sed -i 's/- \[ \] 1.1/- [x] 1.1/' openspec/changes/add-mult/tasks.md
cat > openspec/changes/add-mult/run-log.md <<'MD'
## 1.1 mult(2, 3) returns 6 (test then code in src/mult.js)
- Hypothèse : opérandes flottants non contrôlés, la spec ne parle que d'entiers → aucune validation de type (src/mult.js)
- Décision : export nommé `mult(a, b)` dans `src/mult.js`, tests dans `test/mult.test.js`
- Écart : Aucun
MD
