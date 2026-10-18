# Proportionnalité : pour un petit besoin, niveau 0 ou 1, et aucun code écrit.
set -e
grep -Eiq 'niveau[^0-9]{0,12}[01]\b' "$RESULT"
[ -z "$(git status --porcelain -- src test)" ]
