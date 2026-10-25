---
name: hx-verify
description: Exige une preuve fraîche avant toute déclaration de fin en lançant les contrôles complets et en rapportant leur sortie réelle. À utiliser avant de dire qu'un travail est terminé, corrigé ou prêt, et avant un commit final ou une PR.
---

# hx-verify : pas de « terminé » sans preuve

**Loi : aucune affirmation « terminé », « corrigé », « ça marche » ou « tests verts » sans une sortie de commande obtenue dans ce message.**

## Étapes

1. `node .harness/hx.mjs check`. Lis toute la sortie : openspec, archives, pistes, trace, lint, typecheck, arch, test.
2. Si un change OpenSpec est concerné : toutes ses tâches sont cochées, et aucun de ses scénarios ne reste sans test. L'étape `trace` en fait alors un échec ; tant qu'une tâche reste, ce n'est qu'un avertissement.
3. Si le comportement se voit à l'exécution (API, interface, CLI) : lance **`hx-verifier`** pour exercer les scénarios.
4. Rapporte un tableau étape → résultat, avec un extrait de chaque échec.

**Un contrôle rouge veut dire que ce n'est pas terminé.** Corrige (avec `hx-debug` si la cause n'est pas évidente), puis reprends à l'étape 1.

## Pièges

| Pensée | Réalité |
|---|---|
| « Les tests passaient tout à l'heure » | Seule une sortie fraîche compte |
| « Seul le lint échoue, c'est cosmétique » | Contrôle rouge = pas terminé |
| « Ce test échouait déjà avant moi » | Prouve-le sur la branche de base, puis signale-le explicitement |
| « Je n'ai changé qu'un commentaire » | Alors `hx check` sera vert en quelques secondes : lance-le |
