---
name: hx-implement
description: Implémente un change OpenSpec tâche par tâche, avec un sous-agent neuf par tâche, une revue de conformité à la spec après chacune et une preuve avant de cocher. À utiliser pour réaliser les tâches d'un change déjà proposé, à la place de /opsx:apply et du skill openspec-apply-change.
argument-hint: "[nom du change]"
---

# hx-implement : un change, une tâche à la fois

## Préparer

1. **Change** : `$ARGUMENTS`, sinon le seul change en cours (`node .harness/hx.mjs openspec list --json`), sinon demande lequel.
2. `node .harness/hx.mjs openspec instructions apply --change <change> --json`. Lis `state`, `tasks`, `context` et `operationGuidance`.
   - `state: "blocked"` : arrête-toi et cite `missingArtifacts`.
   - `state: "all_done"` : rien à implémenter, passe à `hx-verify`.
   - `state: "ready"` : continue. `missingPrerequisites` peut citer `design` : c'est normal en piste M, où `design.md` est facultatif.
3. Lis une fois `proposal.md`, les delta specs et `design.md` s'il existe.
4. **Piste L** (`x-track: L`) : l'utilisateur a-t-il validé le design ? Sinon, arrête-toi et demande-lui.

## Boucle, pour chaque tâche non cochée, dans l'ordre

1. Lance **`hx-implementer`** avec :
   - le nom du change et le texte exact de la tâche ;
   - les scénarios concernés, copiés de la delta spec, avec leur identifiant `<capability>/<scénario>` ;
   - l'extrait utile du design ;
   - la consigne : une seule tâche, TDD, rapport avec preuve.
2. Lis son rapport. S'il n'y a pas de preuve d'exécution, renvoie-le la chercher.
3. Indexe **les seuls fichiers de la tâche** (`git add <fichiers>`, d'après le rapport et `git status`), puis lance **`hx-spec-reviewer`** sur `git diff --cached` (les fichiers nouveaux y figurent, contrairement à `git diff`) et les scénarios concernés. Un fichier modifié hors de la tâche reste hors du commit : signale-le.
4. En cas de constat bloquant, relance `hx-implementer` avec les constats. **Au plus 3 tours** : au troisième échec, arrête-toi et expose le blocage à l'utilisateur.
5. Coche la tâche dans `tasks.md` (`- [ ]` devient `- [x]`).
6. Commit : `git add openspec/changes/<change>/tasks.md && git commit -m "<change> : <tâche>"` (un sujet par commit).

Ensuite : `hx-verify`, puis `hx-review`.

## Règles

- **Contexte neuf** : chaque tâche a son propre sous-agent ; ne transmets que ce qui la concerne.
- Ne modifie jamais `openspec/specs/`.
- Si une tâche révèle une spec fausse ou incomplète, arrête-toi et propose `/opsx:update`. Ne code pas hors spec.
- Sans sous-agents disponibles : même boucle en séquentiel. Tu ne peux pas juger ton propre travail : applique la grille de `hx-spec-reviewer` comme liste de contrôle, écris dans le rapport final que la revue de conformité **n'est pas indépendante**, et demande à l'utilisateur de relire avant `/hx-ship`.
