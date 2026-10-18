# Règles de dépendance testées (commande `arch`)

**Proportionnalité** : ne configure `arch` que si le besoin existe. C'est le cas si le niveau est ≥ 2 pour au moins une feature, ou s'il y a au moins trois features dont les frontières comptent. Pour un petit projet de niveau 0 ou 1, la relecture (`hx-code-reviewer`) suffit.

Règles à encoder (voir `.claude/rules/architecture.md`) :

1. Une feature n'importe pas les internes d'une autre, seulement son contrat public.
2. `domain/` ne dépend ni du framework, ni des I/O, ni de `adapters/`.
3. `shared/` ne dépend d'aucune feature.
4. Les features ne dépendent pas de `app/`.

Adapte les chemins à la structure réelle du projet, puis vérifie que la règle **échoue** sur une violation volontaire avant de la garder.

## TypeScript / JavaScript : dependency-cruiser

`arch: npx depcruise src --config .dependency-cruiser.cjs`

```js
module.exports = {
  forbidden: [
    { name: 'features-internes', severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/([^/]+)/', pathNot: ['^src/features/$1/', '^src/features/[^/]+/index\\.[jt]s$'] } },
    { name: 'domaine-pur', severity: 'error',
      from: { path: '/domain/' },
      to: { pathNot: ['/domain/', '^src/shared/'] } },
    { name: 'shared-independant', severity: 'error',
      from: { path: '^src/shared/' }, to: { path: '^src/features/' } },
    { name: 'features-sans-app', severity: 'error',
      from: { path: '^src/features/' }, to: { path: '^src/app/' } },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' } },
};
```

## Python : import-linter

`arch: python -m importlinter` (avec `uv run` ou `poetry run` si besoin), contrats dans `pyproject.toml` :

```toml
[tool.importlinter]
root_package = "monapp"

[[tool.importlinter.contracts]]
name = "Features indépendantes"
type = "independence"
modules = ["monapp.features.facturation", "monapp.features.clients"]

[[tool.importlinter.contracts]]
name = "Domaine pur"
type = "forbidden"
source_modules = ["monapp.features.facturation.domain"]
forbidden_modules = ["monapp.features.facturation.adapters", "sqlalchemy", "requests"]

[[tool.importlinter.contracts]]
name = "Shared indépendant"
type = "forbidden"
source_modules = ["monapp.shared"]
forbidden_modules = ["monapp.features"]
```

## .NET : NetArchTest (ou ArchUnitNET)

Projet `tests/Architecture` (xUnit + `NetArchTest.Rules`). `arch: dotnet test tests/Architecture`

```csharp
[Fact]
public void Le_domaine_ne_depend_pas_des_IO()
{
    var result = Types.InAssembly(typeof(AssemblyMarker).Assembly)
        .That().ResideInNamespaceContaining(".Domain")
        .ShouldNot().HaveDependencyOnAny(".Adapters", "Microsoft.EntityFrameworkCore", "System.Net.Http")
        .GetResult();
    Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? []));
}
```

## Java / Kotlin : ArchUnit

Classe `ArchitectureTest` (JUnit 5 + `com.tngtech.archunit`). `arch: mvn -q -Dtest=ArchitectureTest test` (ou `./gradlew test --tests ArchitectureTest`)

```java
@ArchTest
static final ArchRule domaine_pur = noClasses().that().resideInAPackage("..domain..")
    .should().dependOnClassesThat().resideInAnyPackage("..adapters..", "org.springframework..");
```

## Go : go-arch-lint

`arch: go-arch-lint check`, avec les composants et leurs dépendances autorisées déclarés dans `.go-arch-lint.yml`.
