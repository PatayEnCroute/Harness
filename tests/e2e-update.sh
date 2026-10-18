#!/usr/bin/env bash
# Mise à jour d'un projet : une amélioration générique du template arrive par `copier update`
# sans écraser ce que le projet a personnalisé.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
git_commit() { git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm "$1"; }
hx() { node .harness/hx.mjs "$@"; }
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

# 1. Template v1 : l'état courant du repo (modifications non commitées comprises).
cp -r "$repo" "$work/tmpl"
cd "$work/tmpl"
git_commit "v1" || true
git tag v1

# 2. Projet installé depuis v1, puis personnalisé.
cp -r "$repo/tests/fixtures/node" "$work/proj"
cd "$work/proj"
git init -q
git_commit "fixture"
"${copier[@]}" copy --trust --defaults --vcs-ref v1 "$work/tmpl" .
hx detect --write
printf '# Projet démo\n\nCarte personnalisée.\n' > .harness/project.md
sed -i '1a\\nConsigne locale ajoutée à la main.' CLAUDE.md   # modifie une autre zone que le template
sed -i 's#"Bash(openspec \*)"#"Bash(openspec *)",\n      "Bash(npm test)"#' .claude/settings.json   # zone que v3 modifiera aussi
git_commit "personnalisation"

# 3. Template v2 : un fichier générique et un fichier spécifique évoluent.
cd "$work/tmpl"
printf '\n<!-- amélioration v2 -->\n' >> template/CLAUDE.md
node -e "const f='template/.harness/config.json',c=JSON.parse(require('fs').readFileSync(f));c.components={x:{path:'.',commands:{}}};require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
git_commit "v2"
git tag v2

# 4. Mise à jour du projet.
cd "$work/proj"
"${copier[@]}" update --trust --defaults --vcs-ref v2

# 5. Vérifications.
grep -q 'amélioration v2' CLAUDE.md || fail "l'amélioration générique n'est pas arrivée"
grep -q 'Consigne locale ajoutée' CLAUDE.md || fail "la modification locale de CLAUDE.md a été perdue"
grep -q 'Carte personnalisée' .harness/project.md || fail ".harness/project.md a été écrasé"
node -e "const c=require('./.harness/config.json'); if (!c.components['fixture-node'] || c.components.x) process.exit(1)" \
  || fail ".harness/config.json a été écrasé"
grep -q '^_commit: v2$' .copier-answers.yml || fail "version du template non enregistrée"
if grep -rIl --exclude-dir=.git '^<<<<<<< ' . ; then fail "conflit de fusion"; fi
if [ -n "$(find . -name '*.rej' -not -path './.git/*')" ]; then fail "fichiers .rej"; fi
hx doctor --no-run

# 6. Template v3 : la version épinglée d'OpenSpec monte, et settings.json change dans la zone personnalisée.
git_commit "après update v2" || true
cd "$work/tmpl"
sed -i 's/^  default: "[0-9.]*"$/  default: "9.9.9"/' copier.yml
sed -i 's#"Bash(openspec \*)"#"Bash(openspec *)",\n      "Bash(git status)"#' template/.claude/settings.json
git_commit "v3"
git tag v3
cd "$work/proj"
"${copier[@]}" update --trust --defaults --skip-tasks --vcs-ref v3 || true   # 9.9.9 n'existe pas : tâches ignorées

node -e "if (require('./.harness/versions.json').openspec !== '9.9.9') process.exit(1)" \
  || fail "la nouvelle version épinglée d'OpenSpec n'est pas arrivée"
grep -q '^<<<<<<< ' .claude/settings.json || fail "scénario de conflit non reproduit"
if out="$(hx doctor --no-run)"; then fail "doctor ne signale pas le conflit de fusion"; fi
grep -q 'conflits non résolus : .claude/settings.json' <<<"$out" || fail "doctor ne nomme pas le fichier en conflit"
grep -q 'settings.json invalide' <<<"$out" || fail "doctor ne signale pas settings.json illisible"
echo "e2e update : OK"
