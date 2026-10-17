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
| Diagnostiquer l'installation | `node .harness/hx.mjs doctor` |

Si une commande manque ou échoue pour une raison d'outillage, signale-le au lieu de la contourner.

## Workflow

- **Petit correctif** (diff descriptible en une phrase) : un test qui échoue, la correction, puis `hx check`.
- **Fonctionnalité ou changement de comportement** : passer par OpenSpec (`/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive`).
- L'archive OpenSpec est le **dernier commit de la PR**.
- Ne modifie jamais `openspec/specs/` à la main : les specs changent uniquement par l'archive d'un change.

## Principes

1. **Pas de « terminé » sans preuve** : montre la sortie fraîche de `hx check`.
2. **Test d'abord** pour tout changement de comportement.
3. **Feature-first, proportionné au besoin** : code rangé par fonctionnalité ; aucune couche ni abstraction sans un besoin nommé. Le niveau d'architecture est déclaré dans `.harness/config.json` (`architecture`).
4. **Petits changements**, un sujet par commit.
5. **Aucun secret** dans le code, les logs ou les fixtures.

## Projet pas encore personnalisé ?

Si `.harness/project.md` contient le marqueur `hx:todo`, propose à l'utilisateur de lancer `/hx-setup`.
