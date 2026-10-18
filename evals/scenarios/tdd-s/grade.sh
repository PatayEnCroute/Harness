# Piste S : pas de change OpenSpec, un test couvre mult, le code fonctionne, hx check est vert.
set -e
[ -z "$(ls openspec/changes | grep -v '^archive$')" ]
grep -rqs 'mult' test/
node --input-type=module -e "import { mult } from './src/mult.js'; if (mult(2, 3) !== 6) process.exit(1);"
node .harness/hx.mjs check
