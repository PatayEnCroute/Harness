---
name: hx-implement
description: Implémente un change OpenSpec tâche par tâche, avec un sous-agent neuf par tâche, une revue de conformité à la spec après chacune et une preuve avant de cocher. À utiliser pour réaliser les tâches d'un change déjà proposé, à la place de /opsx:apply et du skill openspec-apply-change.
argument-hint: "[nom du change]"
---

# hx-implement : un change, une tâche à la fois

Le run commence ici et va **jusqu'au rapport de fin de run sans rendre la main** (jusqu'à la PR relue, en livraison automatique) : l'utilisateur cadre pendant ce temps le change suivant. Il ne relit qu'à la fin.

## Préparer

1. **Change** : `$ARGUMENTS`, sinon le seul change en cours (`node .harness/hx.mjs openspec list --json`), sinon demande lequel.
2. `node .harness/hx.mjs openspec instructions apply --change <change> --json`. Lis `state`, `tasks`, `context` et `operationGuidance`.
   - `state: "blocked"` : arrête-toi et cite `missingArtifacts`.
   - `state: "all_done"` : rien à implémenter, passe à `hx-verify`.
   - `state: "ready"` : continue. `missingPrerequisites` peut citer `design` : c'est normal en piste M, où `design.md` est facultatif.
3. Lis une fois `proposal.md`, les delta specs et `design.md` s'il existe, et `run-log.md` s'il existe : le run reprend (après un compactage ou une interruption), les tâches cochées sont faites et commitées.
4. **Porte de cadrage** : `.openspec.yaml` doit contenir `x-validated` (voir `hx-triage`). Sinon, arrête-toi et demande la validation : sans elle, rien ne garantit que la spec dit ce que l'utilisateur veut.
5. **Worktree neuf** (natif de Claude Code Desktop, ou créé par `hx worktree`) : lance `node .harness/hx.mjs run setup` si les dépendances manquent.

## Boucle, pour chaque tâche non cochée, dans l'ordre

1. Lance **`hx-implementer`** avec :
   - le nom du change et le texte exact de la tâche ;
   - les scénarios concernés, copiés de la delta spec, avec leur identifiant `<capability>/<scénario>` ;
   - l'extrait utile du design ;
   - les **décisions** des tâches précédentes, copiées de `run-log.md` (noms, signatures, formats, emplacements) : elles s'imposent à la tâche ;
   - la consigne : une seule tâche, TDD, rapport avec preuve.
2. Lis son rapport. S'il n'y a pas de preuve d'exécution, renvoie-le la chercher. **Ajoute à `run-log.md`** l'entrée de la tâche, avec ses hypothèses, ses décisions et ses écarts (format ci-dessous) : la conversation n'en garde pas de copie fiable, un compactage peut l'effacer.
3. Indexe **les seuls fichiers de la tâche** (`git add <fichiers>`, d'après le rapport et `git status`), puis lance **`hx-spec-reviewer`** sur `git diff --cached` (les fichiers nouveaux y figurent, contrairement à `git diff`) et les scénarios concernés. Un fichier modifié hors de la tâche reste hors du commit : signale-le.
4. En cas de constat bloquant, relance `hx-implementer` avec les constats. **Au plus 3 tours** : au troisième échec, arrête-toi et expose le blocage à l'utilisateur.
5. Coche la tâche dans `tasks.md` (`- [ ]` devient `- [x]`).
6. Commit : `git add openspec/changes/<change>/tasks.md openspec/changes/<change>/run-log.md && git commit -m "<change> : <tâche>"` (un sujet par commit).

### Journal de run

`openspec/changes/<change>/run-log.md`, une entrée par tâche, ajoutée à la fin, jamais réécrite (archivé avec le change) :

```markdown
## <numéro et texte de la tâche>
- Hypothèse : <choix que la spec ne tranchait pas> → <option retenue> (<fichier>)
- Décision : <nom, signature, format ou emplacement que les tâches suivantes doivent respecter>
- Écart : <ce qui dépasse la tâche ou n'a pas pu être fait>
```

Une ligne par élément ; « Aucune » si la tâche n'en a pas. `hx-review` en tire les hypothèses du rapport de fin de run.

Ensuite, **sans rendre la main** : `hx-verify`, puis `hx-review`, qui se termine par le rapport de fin de run, puis par `/hx-ship` si `hx confidence` autorise la livraison automatique, après la boucle de correction si le score l'exige.

## Arrêts autorisés pendant le run

Seulement ceux-là. Dans chaque cas, arrête-toi avec un rapport de fin de run qui expose le blocage (format de `hx-review`, écrit dans `run-report.md` du change).

- `state: "blocked"` (préparation, étape 2).
- 3 échecs sur une même tâche (boucle ci-dessus).
- Spec fausse ou incomplète : propose `/opsx:update` et retire `x-validated`. La spec modifiée repasse la porte de cadrage.
- Nouvelle couche, contrat public ou migration découverts : la piste monte (`hx-triage`), et `x-validated` est retiré de la même façon.
- Décision d'un ADR du change à changer sur le fond (autre option retenue) : l'ADR repasse à `Proposé`, `x-validated` est retiré, et la décision repasse la porte. Un simple détail se corrige dans l'ADR, dans le diff de la tâche (`hx-adr`).
- Outillage cassé : une commande `hx` qui échoue pour une raison étrangère au code.

Tout le reste se décide sans l'utilisateur. Le choix le plus simple qui respecte la spec est consigné comme hypothèse dans le rapport, et non posé comme question.

## Règles

- **Contexte neuf** : chaque tâche a son propre sous-agent ; ne transmets que ce qui la concerne, plus les décisions du journal.
- **Reprise** : après un compactage, le hook `SessionStart` rappelle la tâche suivante et le journal ; reprends la boucle sans rendre la main, sans refaire une tâche cochée.
- Ne modifie jamais `openspec/specs/`.
- Si une tâche révèle une spec fausse ou incomplète, arrête-toi et propose `/opsx:update`. Ne code pas hors spec.
- Sans sous-agents disponibles : même boucle en séquentiel. Tu ne peux pas juger ton propre travail : applique la grille de `hx-spec-reviewer` comme liste de contrôle, écris dans le rapport final que la revue de conformité **n'est pas indépendante**, et demande à l'utilisateur de relire avant `/hx-ship`.
