# ADR-003 : Pas de plugin Claude Code au niveau utilisateur

- Statut : Accepté
- Date : 2026-10-18

## Besoin
Le plan (phase 3) envisageait un plugin installé au niveau utilisateur, pour que les améliorations des skills et agents arrivent dans tous les projets sans `copier update`.

## Contexte
- Les skills et agents appellent `node .harness/hx.mjs` et lisent `.harness/config.json` : ils n'ont de sens que dans un projet où le template est installé.
- Un plugin utilisateur est absent des sessions cloud et des autres machines tant que le projet ne le déclare pas.
- Un plugin ajouterait une deuxième source de vérité, non versionnée par projet, pour les mêmes fichiers.
- `copier update` propage déjà les améliorations en une commande, avec une version tracée par projet.

## Options
| Option | Coût | Rend plus facile | Rend plus difficile | Réversible ? |
|---|---|---|---|---|
| **Ne rien changer : Copier seul** | nul | reproductibilité, sessions cloud | mise à jour : une commande par projet | oui |
| Plugin en complément | moyen : packaging, versions, doublons de skills | mise à jour instantanée | savoir quelle version tourne où ; doublons avec les fichiers du projet | oui |

## Décision
Pas de plugin. Le besoin (mise à jour instantanée) n'est pas observé, et le coût (deux sources de vérité) est réel.

## Conséquences
- Plus facile : une seule source de vérité, versionnée par projet ; sessions cloud et autres machines identiques.
- Plus difficile : chaque projet se met à jour par sa propre commande `copier update`.

## Révision
Si `copier update` devient une corvée observable (beaucoup de projets en retard malgré `hx doctor`), ou si des skills indépendants du projet apparaissent.
