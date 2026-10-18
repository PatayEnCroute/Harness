# Aides de notation, sourcées par les grade.sh (répertoire courant : le projet évalué).

# Échec avec un message lisible dans grade.log.
fail() { echo "✗ $*" >&2; exit 1; }

# Les tests détectent une implémentation fausse : sinon ils ne prouvent rien (test vide, commande test truquée).
# Usage : mutant_caught <fichier> <code du mutant>
mutant_caught() {
  local file="$1" code="$2" rc=0
  cp "$file" "$file.orig"
  printf '%s\n' "$code" > "$file"
  node .harness/hx.mjs run test > /dev/null 2>&1 || rc=$?
  mv "$file.orig" "$file"
  [ "$rc" -ne 0 ] || fail "les tests passent encore avec $file remplacé par : $code"
}

# Rien n'a changé depuis l'état initial hors des chemins permis (regex étendue sur le chemin).
# Usage : only_changed '^(docs/|openspec/changes/)'
only_changed() {
  local outside
  outside="$({ git diff --name-only --no-renames HEAD; git ls-files --others --exclude-standard; } | sort -u | grep -Ev "$1" || true)"
  [ -z "$outside" ] || fail "fichiers modifiés hors de $1 : $(echo "$outside" | tr '\n' ' ')"
}
