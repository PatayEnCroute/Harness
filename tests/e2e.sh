#!/usr/bin/env bash
# Bout en bout sur un projet de démo : copier copy → hx detect --write → setup → doctor → check.
# Usage : tests/e2e.sh <fixture>   (node, python, dotnet, go, mixed)
set -euo pipefail

fixture="${1:?usage : tests/e2e.sh <fixture>}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
hx() { node .harness/hx.mjs "$@"; }

cp -r "$repo/tests/fixtures/$fixture" "$work/$fixture"
cd "$work/$fixture"
git init -q
git add -A
git -c user.email=ci@example.com -c user.name=ci commit -qm "fixture $fixture"

"${copier[@]}" copy --trust --defaults --vcs-ref HEAD "$repo" .

hx detect --write

# Le workflow généré, exécuté hors GitHub : ses étapes `run:` et celles de l'action d'outillage
# (dépendances, hx check) tournent ici, `npm i -g` simulé pour ne pas toucher à l'installation globale.
mkdir -p "$work/steps" "$work/bin"
uv run --no-project --quiet --with pyyaml python - "$work/steps" \
  .github/workflows/hx-check.yml .harness/ci/setup/action.yml .github/dependabot.yml <<'PY'
import re, sys, yaml
out, *files = sys.argv[1:]
workflow, action, dependabot = (yaml.safe_load(open(f)) for f in files)
job = workflow["jobs"]["check"]
assert workflow[True]["push"]["branches"] == ["main"], "branche par défaut non rendue"   # YAML 1.1 : on → True
assert workflow["permissions"] == {"contents": "read"} and "concurrency" in workflow and job["timeout-minutes"]
assert action["runs"]["using"] == "composite"
assert dependabot["updates"][0]["package-ecosystem"] == "github-actions"
runs = []
for step in job["steps"]:
    uses = step.get("uses", "")
    if uses == "./.harness/ci/setup":
        runs += [s["run"] for s in action["runs"]["steps"] if "run" in s]
    elif uses:
        assert re.fullmatch(r"[\w.-]+/[\w.-]+@[0-9a-f]{40}", uses), f"action non épinglée par SHA : {uses}"
    else:
        runs.append(step["run"])
assert any("hx.mjs check" in r for r in runs), "hx check absent du workflow"
for i, run in enumerate(runs):
    open(f"{out}/{i:02d}.sh", "w").write(run)
PY
cat > "$work/bin/npm" <<EOF
#!/usr/bin/env bash
case " \$* " in *" -g "*|*" --global "*) echo "\$*" >> "$work/npm-global.log"; exit 0 ;; esac
exec "$(command -v npm)" "\$@"
EOF
chmod +x "$work/bin/npm"
for step in "$work"/steps/*.sh; do
  PATH="$work/bin:$PATH" bash --noprofile --norc -eo pipefail "$step"   # shell des étapes run: sur GitHub
done
pinned="$(sed -n '/^openspec_version:/,/^$/s/^  default: "\(.*\)"$/\1/p' "$repo/copier.yml")"
if [ -z "$pinned" ] || ! grep -qxF "i -g @fission-ai/openspec@$pinned" "$work/npm-global.log"; then
  echo "ÉCHEC : le workflow n'installe pas OpenSpec ${pinned:-?}" >&2; exit 1
fi

hx doctor
echo "e2e $fixture : OK"
