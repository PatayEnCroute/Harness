# Aides de notation, sourcées par les grade.sh (répertoire courant : le projet évalué).
# INITIAL_SHA : commit « état initial » du projet, avant l'agent (exporté par run.sh).

# Échec avec un message lisible dans grade.log ; run.sh reprend la première ligne « ✗ » comme raison du verdict.
fail() { echo "✗ $*" >&2; exit 1; }

# Remplace <fichier> par <code>, exécute la suite de commandes passée en arguments, puis restaure le fichier.
# Renvoie le code de sortie de la commande. Le mutant doit se charger : sinon c'est la notation qui est fausse.
with_mutant() {
  local file="$1" code="$2" rc=0
  shift 2
  cp "$file" "$file.orig"
  printf '%s\n' "$code" > "$file"
  case "$file" in
    *.js|*.mjs)
      node --input-type=module -e 'await import(process.argv[1])' "$PWD/$file" > /dev/null 2>&1 \
        || { mv "$file.orig" "$file"; fail "mutant invalide (ne se charge pas) pour $file : $code"; } ;;
  esac
  "$@" > /dev/null 2>&1 || rc=$?
  mv "$file.orig" "$file"
  return "$rc"
}

# Les tests détectent une implémentation fausse : sinon ils ne prouvent rien (test vide, commande test truquée).
# Les tests passent d'abord sur le code de l'agent : un échec préexistant ne compte pas comme mutant détecté.
# Usage : mutant_caught <fichier> <code du mutant>
mutant_caught() {
  node .harness/hx.mjs run test > /dev/null 2>&1 || fail "les tests échouent déjà sans mutant"
  local rc=0
  with_mutant "$1" "$2" node .harness/hx.mjs run test || rc=$?
  [ "$rc" -ne 0 ] || fail "les tests passent encore avec $1 remplacé par : $2"
}

# Comme mutant_caught, mais par scénario : un fichier de test tagué « @scenario <id> » doit échouer à lui seul.
# Usage : mutant_caught_by <capability/scénario> <fichier> <code du mutant>
mutant_caught_by() {
  local id="$1" file="$2" code="$3" tagged caught=""
  tagged="$(grep -rlF --exclude-dir=node_modules --exclude-dir=.git -- "@scenario $id" . || true)"
  [ -n "$tagged" ] || fail "aucun fichier tagué @scenario $id"
  local t
  while IFS= read -r t; do
    node .harness/hx.mjs run test --file "$t" > /dev/null 2>&1 || fail "$t échoue déjà sans mutant"
    if ! with_mutant "$file" "$code" node .harness/hx.mjs run test --file "$t"; then caught=1; fi
  done <<< "$tagged"
  [ -n "$caught" ] || fail "aucun test tagué @scenario $id n'échoue avec $file remplacé par : $code"
}

# Rien n'a changé depuis l'état initial hors des chemins permis (regex étendue sur le chemin).
# Comparé au commit initial, pas à HEAD : un agent qui commite ne cache pas ses modifications.
# Usage : only_changed '^(docs/|openspec/changes/)'
only_changed() {
  local outside base="${INITIAL_SHA:?INITIAL_SHA non défini : à exporter par run.sh}"
  outside="$({ git diff --name-only --no-renames "$base"; git ls-files --others --exclude-standard; } | sort -u | grep -Ev "$1" || true)"
  [ -z "$outside" ] || fail "fichiers modifiés hors de $1 : $(echo "$outside" | tr '\n' ' ')"
}

# Le sous-agent demandé a vraiment été lancé (outil Agent ou Task) et a rendu un résultat sans erreur, d'après le transcript.
# Usage : subagent_called hx-architect
subagent_called() {
  local msg
  msg="$(node -e '
    const [file, name] = process.argv.slice(1);
    const calls = new Set();
    const ok = new Set();
    for (const line of require("fs").readFileSync(file, "utf8").split("\n")) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      for (const b of e?.message?.content ?? []) {
        if (e.type === "assistant" && b?.type === "tool_use" && ["Agent", "Task"].includes(b.name) && b.input?.subagent_type === name) calls.add(b.id);
        if (e.type === "user" && b?.type === "tool_result" && calls.has(b.tool_use_id) && !b.is_error) ok.add(b.tool_use_id);
      }
    }
    if (!calls.size) { console.error(`sous-agent ${name} jamais lancé`); process.exit(1); }
    if (!ok.size) { console.error(`sous-agent ${name} lancé mais sans résultat exploitable`); process.exit(1); }
  ' "$TRANSCRIPT" "$1" 2>&1)" || fail "$msg"
}
