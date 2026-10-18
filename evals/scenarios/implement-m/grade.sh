# Toutes les tâches cochées, chaque scénario couvert par un test tagué, hx check vert.
set -e
! grep -q -- '- \[ \]' openspec/changes/add-mult/tasks.md
grep -rqs '@scenario calc/multiply-two-numbers' test/
grep -rqs '@scenario calc/multiply-by-zero' test/
node .harness/hx.mjs check
