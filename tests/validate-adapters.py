# Fichiers générés pour les autres harness, relus par de vrais parseurs : TOML (Codex), YAML (frontmatters, patch dsh,
# politique des skills) et schéma JSON officiel d'OpenCode. Lancé par tests/e2e-adapters.sh, dans le projet installé.
# Usage : python validate-adapters.py <schéma OpenCode téléchargé>
import glob, json, sys, tomllib
import jsonschema, yaml

def frontmatter(path):
    text = open(path, encoding="utf-8").read()
    assert text.startswith("---\n"), f"{path} : frontmatter absent"
    return yaml.safe_load(text.split("\n---\n", 1)[0][4:])

agents = sorted(glob.glob(".codex/agents/*.toml"))
assert agents, "aucun agent Codex"
for path in agents:
    agent = tomllib.load(open(path, "rb"))
    assert {"name", "description", "developer_instructions"} <= agent.keys(), path
    assert agent["name"].replace("_", "-") == path.split("/")[-1][:-5], path
    assert agent["developer_instructions"].strip(), path
config = tomllib.load(open(".codex/config.toml", "rb"))
assert config["shell_environment_policy"]["set"]["OPENSPEC_TELEMETRY"] == "0"

for path in glob.glob(".agents/skills/*/agents/openai.yaml"):
    assert yaml.safe_load(open(path, encoding="utf-8")) == {"policy": {"allow_implicit_invocation": False}}, path
patch = yaml.safe_load(open(".dsh/harness.patch.yml", encoding="utf-8"))
assert patch[0] == {"id": "agent-instructions", "config": {"instructionFileCandidates": ["AGENTS.md"]}}, patch[0]
assert patch[1]["insert"][0]["name"] == "@deepseek-ai/dsh-hooks-claude-code"
assert patch[1]["insert"][0]["config"] == {"configPath": "./.dsh/hooks.json", "projectDir": "."}

for path in sorted(glob.glob(".opencode/agents/*.md")):
    data = frontmatter(path)
    assert data["mode"] == "subagent" and data["description"], path
for path in sorted(glob.glob(".agents/agents/*.md")):
    data = frontmatter(path)
    assert data["name"] and data["description"] and isinstance(data["tools"], list) and data["tools"], path
for path in sorted(glob.glob(".agents/rules/*.md")):
    data = frontmatter(path)
    assert data["trigger"] in ("glob", "always_on") and (data["trigger"] != "glob" or isinstance(data["globs"], str)), path
for path in sorted(glob.glob(".agents/skills/*/SKILL.md")):
    data = frontmatter(path)
    assert data["name"] == path.split("/")[-2] and data["description"], path

schema = json.load(open(sys.argv[1], encoding="utf-8"))
jsonschema.Draft202012Validator.check_schema(schema)
errors = sorted(jsonschema.Draft202012Validator(schema).iter_errors(json.load(open(".opencode/opencode.json"))), key=str)
assert not errors, "opencode.json refusé par le schéma officiel :\n" + "\n".join(f"- {e.json_path} : {e.message}" for e in errors)
print("fichiers générés : TOML, YAML et schéma OpenCode valides")
