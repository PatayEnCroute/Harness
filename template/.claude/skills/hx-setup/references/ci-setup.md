# Outillage CI par stack (`.harness/ci/setup/action.yml`)

Le workflow `hx-check.yml` installe déjà Node 22 (requis par `hx` et OpenSpec). L'action composite `.harness/ci/setup/action.yml` n'ajoute **que** les runtimes des autres stacks. Les versions viennent des fichiers du projet quand ils existent (`global.json`, `go.mod`, `.python-version`…).

```yaml
name: Outillage de la stack
description: Installe les runtimes nécessaires aux commandes de .harness/config.json
runs:
  using: composite
  steps:
    # Ajouter ici les étapes des stacks du projet, par exemple :
    - uses: actions/setup-python@v7
      with:
        python-version-file: api/.python-version   # ou python-version: "3.12"
```

| Stack | Étapes |
|---|---|
| Node (npm) | Rien : déjà installé par le workflow |
| Node (pnpm, yarn) | `- run: corepack enable` avec `shell: bash` |
| Python | `actions/setup-python@v7` ; avec uv, ajouter `astral-sh/setup-uv@v7` |
| .NET | `actions/setup-dotnet@v6` avec `global-json-file: global.json` ou `dotnet-version: 8.0.x` |
| Go | `actions/setup-go@v7` avec `go-version-file: <composant>/go.mod` |
| Java | `actions/setup-java@v6` avec `distribution: temurin` et `java-version: "21"` |
| Rust | `- run: rustup component add clippy` avec `shell: bash` (rustup est présent sur les runners) |

Une étape `run:` dans une action composite exige `shell: bash`.
