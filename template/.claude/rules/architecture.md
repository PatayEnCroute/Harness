---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.py"
  - "**/*.cs"
  - "**/*.fs"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.java"
  - "**/*.kt"
  - "**/*.scala"
  - "**/*.rb"
  - "**/*.php"
  - "**/*.swift"
  - "**/*.dart"
---

# Architecture : feature-first, proportionnée au besoin

Le niveau du projet et les écarts par feature sont dans `.harness/config.json` (`architecture`). Respecte-les.

| Niveau | Forme |
|---|---|
| 0 · Simple | Un module, sans découpage |
| 1 · Feature-first *(défaut)* | Un dossier par feature avec sa tranche verticale complète (entrée, logique, données, tests). Pas d'abstraction. |
| 2 · Feature + domaine isolé | Dans la feature : `domain/` pur, et des ports/adaptateurs seulement aux frontières qui en ont besoin |
| 3 · Monolithe modulaire | Modules à contrats publics explicites, règles de dépendance testées |

## Règles de dépendance

- Une feature n'importe jamais les **internes** d'une autre feature, seulement son contrat public.
- `domain/` ne dépend ni du framework, ni des I/O, ni des adaptateurs.
- `app/` (composition : injection, routes, config) dépend des features, jamais l'inverse.
- `shared/` est minimal et nommé ; pas de `utils` ou `common` fourre-tout ; il ne dépend d'aucune feature.

## Pas de besoin, pas de couche

- Toute abstraction (interface, port, repository, mapper, bus, factory) cite le besoin qu'elle sert : un test qui l'exige, un 2ᵉ implémenteur réel, une frontière d'I/O.
- Pas de pattern par réflexe : CQRS, event sourcing, microservices, repository générique.
- Si un changement semble demander un niveau supérieur, ne l'introduis pas : arrête-toi et propose une décision via `hx-architect` (ADR si la décision est difficilement réversible).
