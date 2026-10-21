# Lint des commentaires

Ce que le lint peut vérifier de `.claude/rules/comments.md` : **les formes** (code commenté, TODO, directive de désactivation sans raison). Un commentaire qui contredit le code reste l'affaire de `hx-code-reviewer`.

**Proportionnalité** : ces règles s'ajoutent au linter que le composant utilise déjà (commande `lint`). Sans linter, n'en installe pas un pour elles : la revue suffit.

**Vérification** : ajoute une ligne de code commentée et un `TODO` dans un fichier source, vérifie que `node .harness/hx.mjs run lint` échoue sur les deux, puis retire-les.

## TypeScript / JavaScript : ESLint

Dépendances de dev : `eslint-plugin-sonarjs`, `@eslint-community/eslint-plugin-eslint-comments`. Dans `eslint.config.*` :

```js
import sonarjs from 'eslint-plugin-sonarjs';
import comments from '@eslint-community/eslint-plugin-eslint-comments';

export default [
  // … configuration existante
  {
    plugins: { sonarjs, '@eslint-community/eslint-comments': comments },
    rules: {
      'sonarjs/no-commented-code': 'error',
      'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'hack', 'xxx'] }],
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },
];
```

## Python : Ruff

Dans `pyproject.toml` (ou `ruff.toml`), ajoute à la sélection existante :

```toml
[tool.ruff.lint]
extend-select = ["ERA001", "FIX", "PGH003", "PGH004"]
```

`ERA001` : code commenté. `FIX` : TODO, FIXME, XXX, HACK. `PGH003`, `PGH004` : `# type: ignore` et `# noqa` sans code précis.

## C# / .NET : SonarAnalyzer

Paquet `SonarAnalyzer.CSharp` (dans `Directory.Build.props` pour tous les projets), puis dans `.editorconfig` :

```ini
[*.cs]
dotnet_diagnostic.S125.severity = error
dotnet_diagnostic.S1134.severity = error
dotnet_diagnostic.S1135.severity = error
```

`S125` : code commenté. `S1134` : FIXME. `S1135` : TODO. Ils font échouer la compilation, donc `dotnet test`. Vérifie si la commande `lint` du contrat (`dotnet format … --verify-no-changes`) les signale aussi ; sinon, ils restent attrapés par l'étape `test` de `hx check`.

## Go : golangci-lint

Dans `.golangci.yml` (format v2 ; en v1, `settings` s'appelle `linters-settings` à la racine) :

```yaml
linters:
  enable: [godox, gocritic, nolintlint]
  settings:
    gocritic:
      enabled-checks: [commentedOutCode]
    nolintlint:
      require-explanation: true
```

## Autres stacks

L'équivalent s'il existe : Checkstyle `TodoComment` (Java), detekt `ForbiddenComment` (Kotlin). Sinon, rien : la revue suffit.

## Code existant en infraction

Compte les violations avant d'activer les règles. S'il y en a, montre le décompte à l'utilisateur et propose : les corriger maintenant, dans un commit séparé (défaut) ; ou activer les règles partout sauf sur les fichiers déjà en infraction, listés en exception dans la configuration du linter. C'est un cliquet : la liste ne fait que diminuer. Pas de mode avertissement : le hook de lint et `hx check` ne signalent que les échecs.
