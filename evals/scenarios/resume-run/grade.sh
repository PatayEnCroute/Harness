# Après un vrai compactage (/compact), le run reprend seul depuis les fichiers du change : tâche suivante faite, rien
# de refait, rapport de fin de run dont les hypothèses viennent du journal.
source "$EVAL_LIB/grade.sh"
change=openspec/changes/add-mult
if grep -q -- '- \[ \]' "$change/tasks.md"; then fail "tâches non cochées : le run n'a pas repris jusqu'au bout"; fi
grep -rqs '@scenario calc/multiply-by-zero' test/ || fail "tâche 1.2 non faite : tag @scenario calc/multiply-by-zero absent"
[ -f "$change/run-report.md" ] || fail "pas de rapport de fin de run"
# L'hypothèse peut être reformulée (« flottants », « non entiers ») : section des hypothèses, type d'opérande et absence de contrôle.
hypotheses="$(sed -n '/^### Hypothèses/,/^### /p' "$change/run-report.md")"
grep -qiE 'flottant|non[- ]entier|décima' <<< "$hypotheses" && grep -qiE 'contr[ôo]l|valid' <<< "$hypotheses" \
  || fail "hypothèse de la tâche 1.1 (journal) absente des hypothèses du rapport"
grep -q '^## 1\.2' "$change/run-log.md" || fail "pas d'entrée du journal pour la tâche 1.2"
[ "$(grep -c '^## 1\.1' "$change/run-log.md")" -eq 1 ] || fail "journal réécrit ou tâche 1.1 refaite"
assumptions="$(sed -n 's/^x-run-assumptions: *\([0-9]*\).*/\1/p' "$change/.openspec.yaml")"
[ "${assumptions:-0}" -ge 1 ] || fail "x-run-assumptions absent ou nul alors que le journal porte une hypothèse"
node --input-type=module -e "
  import { mult } from './src/mult.js';
  if (mult(2, 3) !== 6 || mult(7, 0) !== 0) throw new Error('mult(2, 3) = ' + mult(2, 3) + ', mult(7, 0) = ' + mult(7, 0));
"
node .harness/hx.mjs check
