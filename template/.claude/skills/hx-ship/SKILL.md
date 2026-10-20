---
name: hx-ship
description: Livre une branche. Vérification finale, archive OpenSpec en dernier commit, push, PR et suivi de la CI. À lancer explicitement quand le travail est vérifié et relu.
argument-hint: "[nom du change]"
disable-model-invocation: true
---

# /hx-ship : livrer

## Préalables, sinon arrête-toi

- `hx-verify` vert dans cette conversation, après le dernier changement de code.
- `hx-review` sans constat bloquant restant.
- Décision de l'utilisateur sur les mineurs du rapport de fin de run, et correctifs retenus commités. Sans réponse, pose la question et arrête-toi : l'archive vient après.
- Aucune modification non commitée hors de `openspec/`.

## Étapes

1. **Archive OpenSpec** (pistes M et L) : toutes les tâches doivent être cochées. Lance `node .harness/hx.mjs openspec archive <change> -y` : la CLI synchronise les specs principales et déplace le change dans `openspec/changes/archive/`, sans écriture à la main dans `openspec/specs/` (qui demanderait une confirmation). Puis `node .harness/hx.mjs check` : archives validées, trace sur les specs principales. S'il est vert, commit : `<change> : archive OpenSpec`. C'est le **dernier commit** de la PR.
2. **Push** : `git push -u origin <branche>`.
3. **PR** : si `gh` est disponible, lance `gh pr create`. Sinon, donne le lien de création. Corps de la PR :
   - **Pourquoi** : repris de `proposal.md`.
   - **Quoi** : les changements, en quelques puces.
   - **Piste** : S, M ou L, et les ADR éventuels.
   - **Hypothèses** : celles du rapport de fin de run, avec la décision de l'utilisateur.
   - **Vérification** : résumé de la sortie de `hx check`.
   - **Traçabilité** : résumé de `hx trace`.
4. **CI** : `gh pr checks --watch`. En cas d'échec : diagnostique (`hx-debug`), corrige (voir ci-dessous), relance `hx-verify`, pousse. Ne désactive jamais un contrôle pour passer.
5. **Après le merge**, dans le dossier principal mis à jour (`git pull`) : `hx-learn`. Si le change avait son worktree (`hx worktree`), supprime-le ensuite avec sa branche : `git worktree remove <dossier>`, puis `git branch -d <branche>`.

## Correctif après l'archive

CI rouge, retour de revue, mineur décidé trop tard : jamais de `rebase` ni de `push --force` pour remettre l'archive en dernier.

1. `git revert --no-edit <commit d'archive>` : le change revient dans `openspec/changes/`.
2. Correctif, commité, puis `hx-verify`.
3. Archive à nouveau (étape 1), puis push.

**PR ouverte plus tôt** (pour lancer la CI, par exemple) : ouvre-la sans l'archive, et ajoute l'archive en dernier commit juste avant le merge.
