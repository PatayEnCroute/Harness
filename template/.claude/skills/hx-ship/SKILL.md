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
- Aucune modification non commitée hors de `openspec/`.

## Étapes

1. **Archive OpenSpec** (pistes M et L) : toutes les tâches doivent être cochées. Lance `/opsx:archive <change>`, qui synchronise les specs principales et déplace le change dans `openspec/changes/archive/`. Puis `node .harness/hx.mjs check` : archives validées, trace sur les specs principales. Commit : `<change> : archive OpenSpec`. C'est le **dernier commit** de la PR.
2. **Push** : `git push -u origin <branche>`.
3. **PR** : si `gh` est disponible, lance `gh pr create`. Sinon, donne le lien de création. Corps de la PR :
   - **Pourquoi** : repris de `proposal.md`.
   - **Quoi** : les changements, en quelques puces.
   - **Piste** : S, M ou L, et les ADR éventuels.
   - **Vérification** : résumé de la sortie de `hx check`.
   - **Traçabilité** : résumé de `hx trace`.
4. **CI** : `gh pr checks --watch`. En cas d'échec : diagnostique (`hx-debug`), corrige, relance `hx-verify`, pousse. Ne désactive jamais un contrôle pour passer.
5. **Après le merge** : `hx-learn`.
