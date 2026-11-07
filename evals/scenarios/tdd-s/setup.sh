source "$(dirname "${BASH_SOURCE[0]}")/../../lib/configure.sh"
# Bug existant : sumAll ignore le premier élément. Le corriger rétablit le comportement attendu : piste S (hx-triage).
printf 'export const sum = (a, b) => a + b;\nexport const sumAll = (xs) => xs.slice(1).reduce((total, x) => total + x, 0);\n' > src/sum.js
