# Instructions pour Claude

Ce fichier est **géré par le template Harness** (`copier update`). Ce qui est propre au projet va dans `.harness/project.md`, importé ci-dessous.

@.harness/project.md

## Commandes : toujours passer par `hx`

N'appelle jamais directement l'outil de la stack pour installer, tester, linter ou vérifier. Les commandes réelles sont définies par composant dans `.harness/config.json`. Dans ce fichier, `hx` désigne `node .harness/hx.mjs`.

| Besoin | Commande |
|---|---|
| Lancer les tests | `node .harness/hx.mjs run test` |
| Tester un seul fichier | `node .harness/hx.mjs run test --file <chemin>` |
| Linter | `node .harness/hx.mjs run lint [--file <chemin>]` |
| Installer les dépendances | `node .harness/hx.mjs run setup` |
| Tout vérifier avant de dire « terminé » | `node .harness/hx.mjs check` |
| Scénarios OpenSpec ↔ tests | `node .harness/hx.mjs trace` |
| Diagnostiquer l'installation | `node .harness/hx.mjs doctor` |

Si une commande manque ou échoue pour une raison d'outillage, signale-le au lieu de la contourner.

## Workflow : proportionné au risque

Commence toute demande de changement par **`hx-triage`**, qui choisit la piste.

| Piste | Quand | Enchaînement |
|---|---|---|
| **S** | Diff descriptible en une phrase, aucun comportement spécifié ne change | `hx-tdd` (ou `hx-debug`) → `hx-verify` → commit |
| **M** | Comportement nouveau ou modifié | `hx-clarify` → `/opsx:propose` → `hx-implement` → `hx-verify` → `hx-review` → `/hx-ship` |
| **L** | Contrat public, migration, changement de niveau d'architecture | M + `hx-architect` et `hx-adr`, design validé par l'utilisateur avant d'implémenter |

- Le change OpenSpec porte sa piste : `x-track: M` ou `L` dans `.openspec.yaml`.
- L'archive OpenSpec (`/opsx:archive`) est le **dernier commit de la PR**.
- `openspec/specs/` ne change que par `/opsx:sync` ou `/opsx:archive`.
- Après une livraison ou un incident : `hx-learn`.

## Principes

1. **Pas de « terminé » sans preuve** : une sortie fraîche de `hx check` (`hx-verify`).
2. **Test d'abord** pour tout changement de comportement (`hx-tdd`) ; les tests qui couvrent un scénario portent `@scenario <capability>/<scénario>`.
3. **Qui produit ne juge pas** : la relecture passe par des sous-agents indépendants (`hx-review`).
4. **Feature-first, proportionné au besoin** : code rangé par fonctionnalité ; aucune couche ni abstraction sans besoin nommé. Niveau déclaré dans `.harness/config.json` (`architecture`).
5. **Petits changements**, un sujet par commit.
6. **Aucun secret** dans le code, les logs ou les fixtures.

## Projet pas encore personnalisé ?

Si `.harness/project.md` contient le marqueur `hx:todo`, propose à l'utilisateur de lancer `/hx-setup`.
