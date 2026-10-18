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
| Branche et worktree pour le run d'un change validé | `node .harness/hx.mjs worktree <change>` |

Si une commande manque ou échoue pour une raison d'outillage, signale-le au lieu de la contourner.

## Workflow : proportionné au risque

Commence toute demande de changement par **`hx-triage`** : les critères de choix de la piste n'existent que là.

| Piste | Enchaînement |
|---|---|
| **S** | `hx-tdd` (ou `hx-debug`) → `hx-verify` → commit |
| **M** | `hx-clarify` si la demande est floue → `/opsx:propose` → porte de cadrage → `hx-implement` → `hx-verify` → `hx-review` → `/hx-ship` |
| **L** | M + `hx-architect` et `hx-adr`, design validé par l'utilisateur à la porte de cadrage |

**M et L : cadrage, puis run sans interruption.** L'utilisateur cadre, puis l'agent travaille seul pendant que l'utilisateur cadre le change suivant.

1. **Cadrage** (avec l'utilisateur) : `hx-clarify`, `/opsx:propose`, design en L. Il se termine par **la porte** décrite dans `hx-triage` : validation explicite, `x-validated`, puis `hx worktree <change>`.
2. **Run** (dans le worktree, sans l'utilisateur) : `hx-implement` → `hx-verify` → `hx-review` → rapport de fin de run. **Ne rends pas la main entre ces étapes** et ne pose pas de question en cours de route ; arrête-toi seulement sur les blocages listés dans `hx-implement`.
3. **Livraison** (l'utilisateur) : relecture du rapport, puis `/hx-ship`.

- Le change OpenSpec porte sa piste : `x-track: M` ou `L` dans `.openspec.yaml`.
- L'archive OpenSpec (`/opsx:archive`) est le **dernier commit de la PR**.
- `openspec/specs/` ne change que par `/opsx:sync` ou `/opsx:archive`.
- Pour implémenter un change : `hx-implement`, jamais le skill `openspec-apply-change` installé par OpenSpec.
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
