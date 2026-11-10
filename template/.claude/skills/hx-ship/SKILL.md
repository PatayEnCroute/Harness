---
name: hx-ship
description: Livre une branche. Vérification finale, archive OpenSpec en dernier commit, push, PR et suivi de la CI. À lancer quand le travail est vérifié et relu, sur décision de l'utilisateur (commande, « livre <change> » ou choix « livrer » à la question Livraison), ou par hx-review en fin de run quand « hx confidence » autorise la livraison automatique.
argument-hint: "[nom du change]"
---

# /hx-ship : livrer

## Deux modes

| Mode | Qui lance | Mineurs | PR |
|---|---|---|---|
| **Manuel** | l'utilisateur : `/hx-ship`, « livre <change> », ou un choix « livrer » à la question « Livraison » de `hx-review` | sa décision, correctifs commités avant l'archive | prête à relire |
| **Automatique** | `hx-review`, en fin de run, si `node .harness/hx.mjs confidence <change>` sort en 0 | appliqués avant par la boucle de correction de `hx-review` si le score l'exigeait ; les autres vont dans la revue de la PR | brouillon, puis revue publiée en commentaire (étape 6) |

Tu as lancé ce skill toi-même après une décision de l'utilisateur, choix « livrer » à la question « Livraison » ou message « livre <change> » (« livre-le ») : c'est le mode manuel, et le hook `PreToolUse` te le confirme (le hook `UserPromptSubmit` consigne le message). Un message « livre » décide la livraison, pas les mineurs : s'il y en a de proposés, voir Préalables. Tu l'as lancé sans aucun choix de l'utilisateur : c'est le mode automatique. Le hook `PreToolUse` le refuse si `hx confidence` ne l'autorise pas : n'insiste pas. Suis la boucle de correction de `hx-review` si le refus l'indique, sinon rends la main avec le rapport de fin de run et sa question.

## Préalables, sinon arrête-toi

- `hx-verify` vert dans cette conversation, après le dernier changement de code.
- `hx-review` sans constat bloquant restant.
- **Manuel** : décision de l'utilisateur sur les mineurs du rapport de fin de run (`openspec/changes/<change>/run-report.md` si la conversation ne l'a plus), et correctifs retenus commités, mesures à jour (« Corrections après le rapport » de `hx-review`). Sans réponse (un « livre <change> » ne tranche pas les mineurs), pose la question « Livraison » de `hx-review`, ou en texte sans l'outil AskUserQuestion, et arrête-toi : l'archive vient après sa réponse. Ne livre jamais hors de ce skill (archive ou commit d'archive par Bash).
- **Automatique** : `node .harness/hx.mjs confidence <change>` sort en 0, relancé ici. Aucun mineur n'est appliqué ici : la boucle de correction l'a fait avant, si le score l'exigeait.
- Aucune modification non commitée hors de `openspec/`.

## Étapes

0. **Garde** : `node .harness/hx.mjs ship-gate <change>`. Sortie 1 : arrête-toi et rends la raison à l'utilisateur, sans chercher à contourner. Sortie 0 : la commande dit le mode (manuel ou automatique). `node .harness/hx.mjs openspec archive` applique la même garde : sans décision de l'utilisateur ni indice suffisant, l'archive est refusée, quel que soit le harness.
1. **Base à jour** (si le dépôt suit un distant) : un autre change a pu être mergé pendant le run, et son archive modifier les mêmes specs principales. Reprends la base sans réécrire l'historique : `git pull --no-rebase --no-edit origin <base>` (`default_branch` de `.copier-answers.yml`, sinon `main`). Un conflit sur `openspec/` ou sur le code du change : arrête-toi et expose-le. Puis `node .harness/hx.mjs check` : rouge, corrige avant d'archiver. En mode automatique, un correctif ici est du code non relu : arrête-toi, écris-le dans le rapport de fin de run, et rends la main.
2. **Archive OpenSpec** (pistes M et L) : toutes les tâches doivent être cochées. Lance `node .harness/hx.mjs openspec archive <change> -y` : la CLI synchronise les specs principales et déplace le change dans `openspec/changes/archive/`, sans écriture à la main dans `openspec/specs/`. Puis `node .harness/hx.mjs check` : archives validées, trace sur les specs principales. S'il est vert, commit : `<change> : archive OpenSpec`. C'est le **dernier commit** de la PR.
3. **Push** : `git push -u origin <branche>`.
4. **PR** : si `gh` est disponible, lance `gh pr create` (en mode automatique : `gh pr create --draft`). Sinon, donne le lien de création ; en mode automatique, arrête-toi là. Corps de la PR :
   - **Pourquoi** : repris de `proposal.md`.
   - **Quoi** : les changements, en quelques puces.
   - **Piste** : S, M ou L, et les ADR éventuels.
   - **Hypothèses** : celles du rapport de fin de run (`run-report.md`), avec la décision de l'utilisateur, ou « livraison automatique : non confirmées ».
   - **Vérification** : résumé de la sortie de `hx check`.
   - **Traçabilité** : résumé de `hx trace`.
   - **Livraison** (mode automatique) : la sortie de `hx confidence`.
5. **CI** : `gh pr checks --watch`. En cas d'échec : diagnostique (`hx-debug`), corrige (voir ci-dessous), relance `hx-verify`, pousse. Ne désactive jamais un contrôle pour passer.
6. **Revue de la PR** (mode automatique seulement), une fois la CI verte : `hx-review --pr <numéro>`. Elle relit la PR telle que livrée et publie ses constats en commentaire. Aucun bloquant confirmé : `gh pr ready <numéro>`. Sinon la PR reste en brouillon : le commentaire dit quoi corriger, et c'est à l'utilisateur de décider. Tu ne merges jamais.
7. **Fin** : donne le lien de la PR, et dis à l'utilisateur la suite, sans commande à taper : une fois la PR mergée, une session sur le dossier principal proposera « Capitaliser et nettoyer ».
8. **Capitaliser et nettoyer** (après le merge, dans le dossier principal mis à jour par `git pull` ; proposé en choix cliquable par le hook de démarrage) : `hx-learn`. Si le change avait son worktree, supprime-le ensuite avec sa branche : `git worktree remove <dossier>`, puis `git branch -d <branche>`. Un worktree natif de Desktop (sous `.claude/worktrees/`) : dis aussi à l'utilisateur qu'il peut archiver sa session.

## Correctif après l'archive

CI rouge, retour de revue, mineur décidé trop tard : jamais de `rebase` ni de `push --force` pour remettre l'archive en dernier.

1. `git revert --no-edit <commit d'archive>` : le change revient dans `openspec/changes/`.
2. Correctif, commité, puis `hx-verify`.
3. Base à jour et archive à nouveau (étapes 1 et 2), puis push.

**PR ouverte plus tôt** (pour lancer la CI, par exemple) : ouvre-la sans l'archive, et ajoute l'archive en dernier commit juste avant le merge.
