# Fin de run d'un change M : add-mult implémenté, tâches cochées, hx check vert. Reste la livraison.
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/configure.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/add-mult-change.sh"
printf '## 1. Multiplication\n\n- [x] 1.1 mult(2, 3) returns 6 (test then code in src/mult.js)\n- [x] 1.2 mult(7, 0) returns 0 (test then code)\n' > openspec/changes/add-mult/tasks.md
printf 'export const mult = (a, b) => a * b;\nexport default mult;\n' > src/mult.js
cat > test/mult.test.js <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mult } from '../src/mult.js';

// @scenario calc/multiply-two-numbers
test('mult(2, 3) returns 6', () => {
  assert.equal(mult(2, 3), 6);
});

// @scenario calc/multiply-by-zero
test('mult(7, 0) returns 0', () => {
  assert.equal(mult(7, 0), 0);
});
JS
node .harness/hx.mjs check
