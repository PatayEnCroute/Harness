#!/usr/bin/env bash
# Lanceur npx : installation en une commande dans un dossier vide, refus sur un arbre git sale.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

# Template : l'état courant du repo (modifications non commitées comprises), comme e2e-update.sh.
cp -r "$repo" "$work/tmpl"
(cd "$work/tmpl" && git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm "courant" || true)
harness() { npx --yes "$work/tmpl" --template "$work/tmpl" --vcs-ref HEAD --defaults --no-claude "$@"; }

# 1. Dossier vide, comme un agent (INSTALL.md) : sans terminal, --defaults exigé avant toute écriture,
#    puis git init et installation avec les réponses en --data.
mkdir "$work/neuf" && cd "$work/neuf"
npx --yes "$work/tmpl" --template "$work/tmpl" --vcs-ref HEAD --no-claude </dev/null 2>/dev/null && fail "sans --defaults ni terminal : accepté"
[ ! -e .git ] || fail "git init fait avant le refus"
harness --data project_name=demo --data ci=true --data default_branch=trunk --data codeowners= </dev/null
[ -d .git ] || fail "git init non fait"
[ -f .harness/hx.mjs ] && [ -f CLAUDE.md ] || fail "template non installé"
grep -qx "project_name: demo" .copier-answers.yml && grep -qx "default_branch: trunk" .copier-answers.yml || fail "réponses --data ignorées"
[ ! -e .github/CODEOWNERS ] || fail "CODEOWNERS sans codeowners"
[ -d openspec ] || fail "openspec init non lancé"

# 2. Déjà installé : refus, avec la commande de mise à jour.
git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm "harness"
out="$(harness </dev/null 2>&1)" && fail "réinstallation acceptée"
grep -q "update --trust" <<<"$out" || fail "commande de mise à jour non proposée : $out"

# 3. Projet existant avec des changements non commités : refus, rien d'écrit.
mkdir "$work/sale" && cd "$work/sale"
git init -q && echo x > a.txt && git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm init
echo y > a.txt
harness </dev/null 2>/dev/null && fail "arbre sale accepté"
[ ! -e .harness ] || fail "installation sur un arbre sale"

# 4. Projet existant (INSTALL.md) : sans --overwrite, Copier refuse de remplacer CLAUDE.md ; avec, il le remplace.
mkdir "$work/existant" && cd "$work/existant"
git init -q && echo "# consignes du projet" > CLAUDE.md && git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm init
harness </dev/null >/dev/null 2>&1 && fail "CLAUDE.md remplacé sans --overwrite"
git checkout -q -- . && git clean -qfd
harness --overwrite </dev/null >/dev/null 2>&1 || fail "installation --overwrite en échec"
grep -q "géré par le template Harness" CLAUDE.md || fail "CLAUDE.md non remplacé"
git show HEAD:CLAUDE.md | grep -q "consignes du projet" || fail "version d'avant perdue dans git"

echo "OK : lanceur npx"
