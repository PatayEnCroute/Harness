---
name: hx-discover
description: Projet existant. Écrit la spec OpenSpec de base d'une capability à partir du code et des tests actuels (ce que le système fait réellement), et relie les tests existants par des tags @scenario. À lancer explicitement avant de faire évoluer une partie d'un projet qui n'a pas encore de spec.
argument-hint: "<capability ou dossier à spécifier>"
disable-model-invocation: true
---

# /hx-discover : spécifier l'existant

But : une spec de base **fidèle au comportement actuel**, pour que les prochains changes OpenSpec partent d'une référence. On décrit ce qui **est**, pas ce qui devrait être.

## Règles

- **Une capability à la fois**, celle qui va bientôt changer. Ne spécifie pas tout le projet d'un coup.
- **Observé, pas souhaité** : chaque exigence s'appuie sur du code ou un test que tu cites.
- **Bug suspecté** : ne l'encode pas comme exigence. Liste-le à part et demande à l'utilisateur.
- **Peu d'exigences** : les comportements qui comptent pour l'utilisateur, pas chaque fonction.

## Étapes

1. **Périmètre** : la capability (`$ARGUMENTS`). Lance `hx-explorer` pour cartographier ses points d'entrée, son flux, ses tests et ses dépendances.
2. **Inventaire** : liste les comportements observables (entrées → sorties, erreurs, règles métier) avec, pour chacun, le code et les tests qui le prouvent.
3. **Change de base** : `node .harness/hx.mjs openspec new change baseline-<capability>`, puis ajoute `x-track: M` dans son `.openspec.yaml`.
   - `proposal.md` : « Spécifier l'existant de <capability> », sans changement de comportement.
   - `specs/<capability>/spec.md` : `## Purpose`, puis `## ADDED Requirements` avec exigences et scénarios WHEN/THEN aux valeurs concrètes.
   - `tasks.md` : une tâche par scénario, « relier ou écrire le test ».
4. **Relier les tests** : pour chaque scénario, ajoute le tag `@scenario <capability>/<scénario>` au test existant qui le prouve. S'il n'y en a pas, écris-le en mode caractérisation : il doit passer sur le code actuel.
5. **Vérifier** : `node .harness/hx.mjs openspec validate --all --strict`, puis `node .harness/hx.mjs check`. La trace doit être complète pour ce change.
6. **Archiver** : `/opsx:archive baseline-<capability>`. La spec devient une spec principale.
7. **Rapport** : exigences spécifiées, tests reliés ou écrits, bugs suspectés (à trancher par l'utilisateur), écarts d'architecture constatés.

Si la couverture des specs principales reste partielle sur un projet existant, ajuste `trace.min_coverage` dans `.harness/config.json` à la valeur atteinte (cliquet), jamais à la baisse.
