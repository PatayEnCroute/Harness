# Proportionnalité : pour un petit besoin, niveau 0 ou 1 sur la ligne finale imposée, et aucun code écrit.
# La recommandation doit venir de hx-architect, que le scénario sert à évaluer, pas de l'agent principal seul.
source "$EVAL_LIB/grade.sh"
subagent_called hx-architect
# Une seule ligne « Niveau visé : N » (gras ou code markdown tolérés), sans hésitation ni alternative.
lines="$(sed 's/[*_`]//g; s/[[:space:]]*$//' "$RESULT" | grep -Ei '^[[:space:]]*niveau visé[[:space:]]*:' || true)"
[ -n "$lines" ] || fail "ligne « Niveau visé : N » absente"
[ "$(echo "$lines" | wc -l)" -eq 1 ] || fail "plusieurs lignes « Niveau visé » : $lines"
echo "$lines" | grep -Eiq '^[[:space:]]*niveau visé[[:space:]]*:[[:space:]]*[0-3]\.?$' || fail "format invalide : $lines"
echo "$lines" | grep -Eq '[01]\.?$' || fail "niveau trop élevé pour le besoin : $lines"
# Aucun code : seuls la documentation et un change OpenSpec sont permis.
only_changed '^(docs/|openspec/changes/)'
