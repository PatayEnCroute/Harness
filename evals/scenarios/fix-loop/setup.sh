# Fin de run d'un change M, livraison automatique activée : revue faite, score 75 sous le seuil 80, plafond 100.
# Trois mineurs semés et deux corrections pas encore relues : la boucle de correction doit les effacer, puis livrer.
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/configure.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/add-mult-change.sh"
node -e '
  const fs = require("fs");
  const config = JSON.parse(fs.readFileSync(".harness/config.json", "utf8"));
  config.ship = { auto: true, min_confidence: 80, max_rounds: 3 };
  fs.writeFileSync(".harness/config.json", JSON.stringify(config, null, 2) + "\n");
'
change=openspec/changes/add-mult
printf '## 1. Multiplication\n\n- [x] 1.1 mult(2, 3) returns 6 (test then code in src/mult.js)\n- [x] 1.2 mult(7, 0) returns 0 (test then code)\n' > "$change/tasks.md"
printf 'x-review-confirmed: 2\nx-review-discarded: 0\nx-review-unreviewed: 2\nx-review-minors: 3\nx-review-deferred: 0\nx-review-rounds: 1\nx-run-assumptions: 0\n' >> "$change/.openspec.yaml"
cat > src/mult.js <<'JS'
export function mult(a, b) {
  let result = 0;
  result = a * b;
  return result;
}

export default mult;
JS
cat > test/mult.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mult } from '../src/mult.js';

// @scenario calc/multiply-two-numbers
test('mult(2, 3) returns 6', () => {
  assert.ok(mult(2, 3) === 6);
});

// @scenario calc/multiply-by-zero
test('mult(7, 0) returns 0', () => {
  assert.equal(mult(7, 0), 0);
});
JS
cat > "$change/run-report.md" <<'MD'
## add-mult : Prêt à livrer

Piste M · branche add-mult · tâches 2/2 · 1 commit

### Vérification
hx check : vert · trace : calc/multiply-two-numbers, calc/multiply-by-zero couverts

### Hypothèses à confirmer
Aucune

### Revue
| Gravité | Fichier:ligne | Constat | Suite (corrigé, proposé, écarté et pourquoi) |
|---|---|---|---|
| important | src/mult.js:1 | `mult` additionnait `b` en boucle `a` fois : faux pour `a` négatif | corrigé : `a * b` |
| important | test/mult.test.js:10 | scénario multiply-by-zero sans tag `@scenario` | corrigé : tag ajouté |
| mineur | src/mult.js:2 | variable `result` initialisée puis écrasée aussitôt | proposé : `return a * b;` |
| mineur | src/mult.js:7 | export par défaut que personne n'importe | proposé : le retirer |
| mineur | test/mult.test.js:7 | `assert.ok(mult(2, 3) === 6)` : message d'échec illisible | proposé : `assert.equal(mult(2, 3), 6)` |

### Mineurs proposés (non appliqués)
- src/mult.js:2 — variable `result` initialisée puis écrasée — `return a * b;`
- src/mult.js:7 — export par défaut inutilisé — le retirer
- test/mult.test.js:7 — `assert.ok` au lieu de `assert.equal` — `assert.equal(mult(2, 3), 6)`

### Boucle de correction
| Tour | Relu jusqu'à | Mineurs appliqués | Constats confirmés · corrigés | Score |
|---|---|---|---|---|
| 1 | main | — | 2 · 2 | 75 |

### Livraison
add-mult : score 75/100 (seuil 80, plafond 100) · livraison par l'utilisateur

### Prochaine étape
Boucle de correction : tour 2
MD
node .harness/hx.mjs check
# Template et contrat commités sur main ; le change va sur sa branche, dans le commit « état initial » de run.sh.
git add -A -- . ':!openspec/changes/add-mult' ':!src/mult.js' ':!test/mult.test.js'
git -c user.email=eval@example.com -c user.name=eval commit -qm harness
git checkout -qb add-mult
