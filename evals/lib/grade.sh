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
