---
name: hx-review
description: Fait relire un changement par des sous-agents indépendants (conformité à la spec, qualité et architecture, sécurité si pertinent), vérifie chaque constat pour écarter les faux positifs, puis consolide ; si l'indice de confiance est sous le seuil mais atteignable, corrige et fait relire en boucle avant la livraison automatique. À utiliser après hx-verify et avant de livrer, à la demande sur une branche, ou avec --pr pour publier la revue d'une PR en commentaire (livraison automatique).
argument-hint: "[branche de base, par défaut main] | --pr <numéro>"
---

# hx-review : relecture indépendante

Celui qui a écrit le code ne le juge pas. Les relecteurs n'ont pas ton contexte : c'est voulu.

## Étapes

Avec `--pr <numéro>` : suis la section « Revue d'une PR », plus bas.

1. **Périmètre** : base = `$ARGUMENTS`, sinon `default_branch` de `.copier-answers.yml`, sinon `main`. Lance `git diff <base>...HEAD --stat` et identifie le change OpenSpec concerné.
2. **En parallèle**, après avoir noté le commit relu (`git rev-parse HEAD`, pour la boucle de correction) :
   - `hx-spec-reviewer`, si un change OpenSpec est concerné ;
   - `hx-code-reviewer`, toujours ;
   - `hx-security-reviewer`, si le diff touche des entrées externes, l'authentification, des données personnelles, des secrets, des dépendances, la CI ou l'infrastructure.
3. **Filtre** : les trois relecteurs emploient la même échelle (`bloquant`, `important`, `mineur`). Pour chaque constat bloquant ou important, va lire la ligne citée et confirme-le toi-même. Écarte ce que tu ne peux pas confirmer, avec une raison d'une ligne.
4. **Corrige** les constats bloquants et importants confirmés, en TDD (`hx-tdd`), puis relance `hx-verify`. Un important dont la correction sortirait du change (autre feature, refonte) n'est pas corrigé : il rejoint les mineurs proposés, marqué `important`, avec sa raison.
5. **Mineurs** : ne les corrige pas sans l'accord de l'utilisateur, et ne lui pose pas la question en cours de run. Liste-les dans le rapport, qui se termine par la question. Tant qu'elle n'a pas de réponse, pas d'archive ni de livraison, même si l'utilisateur a demandé la PR d'avance : un correctif commité après l'archive l'empêche d'être le dernier commit. Exceptions : la boucle de correction (ci-dessous) les applique quand `hx confidence` le demande ; la livraison automatique publie ceux qui restent dans la revue de la PR.

## Rapport de fin de run

C'est le dernier message du run : l'utilisateur doit pouvoir décider en quelques minutes, sans relire la conversation.

Si un change OpenSpec est concerné, le rapport survit aussi à la session :

1. Écris-le dans `openspec/changes/<change>/run-report.md` (remplacé à chaque run). `/hx-ship` le relit, `hx status` en affiche le verdict.
2. Ajoute à son `.openspec.yaml` les mesures du run, lues par `hx stats` et `hx confidence` (des entiers, 0 compris) :
   - `x-review-confirmed: <n>` : bloquants et importants confirmés, tous tours confondus ;
   - `x-review-discarded: <n>` : écartés à l'étape 3, tous tours confondus ;
   - `x-review-unreviewed: <n>` : constats corrigés après la dernière relecture (étape 4), donc pas encore relus ;
   - `x-review-minors: <n>` : mineurs proposés et non appliqués, importants reportés compris ;
   - `x-review-deferred: <n>` : importants reportés hors du change (étape 4) ;
   - `x-review-rounds: <n>` : tours de revue, 1 au premier ;
   - `x-run-assumptions: <n>` : hypothèses à confirmer.
3. **Livraison** : `node .harness/hx.mjs confidence <change>`. Recopie sa sortie dans la section « Livraison » du rapport. Revue non indépendante (sans sous-agents, voir `hx-implement`) : livraison par l'utilisateur, quel que soit le score.
4. Commite le rapport et `.openspec.yaml` : `<change> : rapport de fin de run`.
5. **Sortie 0** (livraison automatique) : enchaîne `/hx-ship <change>` sans rendre la main. **Sortie 1 avec `Suite : corriger`** : boucle de correction, ci-dessous. **Sinon** : le rapport est ton dernier message, suivi de la question « Livraison » (ci-dessous).

```markdown
## <change> : Prêt à livrer | Bloqué : <raison en une ligne>

Piste X · branche <branche> · tâches N/N · <n> commits

### Vérification
hx check : <vert, ou étapes rouges> · trace : <scénarios couverts>

### Hypothèses à confirmer
- <choix que la spec ne tranchait pas> → <option retenue> (<fichier>)

### Revue
| Gravité | Fichier:ligne | Constat | Suite (corrigé, proposé, écarté et pourquoi) |
|---|---|---|---|

### Mineurs proposés (non appliqués)
- …

### Boucle de correction
| Tour | Relu jusqu'à | Mineurs appliqués | Constats confirmés · corrigés | Score |
|---|---|---|---|---|
| 1 | <sha> | — | <n> · <n> | <score> |

### Livraison
<sortie de hx confidence : score, seuil, plafond, exclusions, pénalités, suite>

### Prochaine étape
Un clic sur la question « Livraison » ; ou ce qu'il faut trancher ; ou « boucle de correction : tour <n> » ; ou « livraison automatique : /hx-ship lancé »
```

Les sections vides restent, avec « Aucune » : une absence de constat est aussi une information.

### Question « Livraison »

Rapport « Prêt à livrer », sans livraison automatique : la décision sur les mineurs et la livraison tiennent en **un seul clic**. Juste après le rapport, pose la question avec l'outil AskUserQuestion, en-tête exactement `Livraison` (le hook `PostToolUse` lit la réponse ; un choix qui dit « livrer » autorise une fois `/hx-ship`, lancé par toi). Question : « <change> : que fait-on ? Livrer confirme les hypothèses du rapport. (Autre : lesquels appliquer, ou ce qu'il faut reprendre) ». Options, la recommandée en premier :

| Situation | Options |
|---|---|
| Mineurs proposés | « Appliquer les mineurs et livrer (Recommandé) » · « Livrer sans les mineurs » · « Ne pas livrer maintenant » |
| Aucun mineur | « Livrer (Recommandé) » · « Ne pas livrer maintenant » |

Suite selon la réponse :

- **« … livrer »** : applique les mineurs retenus s'il y en a (TDD s'ils touchent un comportement, un commit chacun), `hx-verify`, puis lance `/hx-ship <change>` sans rendre la main.
- **Réponse libre** (« applique 1 et 3 ») : fais ce qu'elle demande, `hx-verify`, puis repose la question, avec les seules options « Livrer (Recommandé) » et « Ne pas livrer maintenant ».
- **« Ne pas livrer maintenant »** : rends la main. Plus tard, « livre <change> » repose la question.

Sans l'outil AskUserQuestion (session sans interface), pose la même question en texte : l'utilisateur livre alors par `/hx-ship <change>`, car le hook ne lit que la réponse rendue par l'outil.

Rapport « Bloqué » : pas de question « Livraison ». Termine par ce qu'il faut trancher, en choix cliquables quand les options sont connues.

## Boucle de correction

Quand `hx confidence` affiche `Suite : corriger` : le score est sous le seuil, mais son plafond l'atteint. La boucle efface les pénalités corrigeables, mineurs non appliqués et corrections pas encore relues, pour livrer sans l'utilisateur. Hypothèses et dépendances restent à lui. Toujours sans rendre la main.

Un tour :

1. **Mineurs** : applique chaque mineur du rapport, un commit par mineur (`<change> : mineur, <constat>`), en TDD s'il touche un comportement. Garde-le en mineur, avec sa raison, s'il sort des fichiers du change, touche le harness, la CI ou les specs principales, ou contredit la spec.
2. `hx-verify`.
3. **Relecture neuve** : étapes 2 et 3 du début, avec des sous-agents neufs, sur le seul diff depuis le dernier commit relu (colonne « Relu jusqu'à ») : `git diff <relu>..HEAD -- . ':!openspec/changes/<change>/run-report.md' ':!openspec/changes/<change>/.openspec.yaml'`. Ne leur donne ni le rapport ni les constats précédents. Note le nouveau commit relu.
4. **Corrige** les bloquants et importants confirmés (étape 4 du début), puis `hx-verify`. Les nouveaux mineurs rejoignent le rapport.
5. **Mesures** : `x-review-rounds` + 1 ; `x-review-confirmed`, `x-review-discarded` et `x-review-deferred` ajoutent ceux du tour ; `x-review-unreviewed` = corrigés à l'étape 4 de ce tour ; `x-review-minors` = mineurs encore non appliqués.
6. **Rapport** : réécris `run-report.md` (ligne ajoutée à « Boucle de correction », revue et mineurs à jour), relance `hx confidence`, commite (`<change> : rapport de fin de run, tour <n>`), et suis sa sortie (étape 5 ci-dessus).

La boucle s'arrête quand `hx confidence` ne dit plus `Suite : corriger` : score au seuil, plafond hors d'atteinte, `ship.max_rounds` atteint, ou exclusion apparue. Un `hx-verify` qui reste rouge après 3 tentatives : rapport `Bloqué`, et tu rends la main.

- **Un compteur suit les constats, jamais l'inverse** : chaque constat écarté garde sa raison dans le tableau de revue. Écarter pour faire monter le score fausse la livraison.
- Aucun test affaibli, désactivé ou supprimé pour corriger.

## Revue d'une PR (`--pr <numéro>`)

Lancée par `/hx-ship` en livraison automatique, une fois la CI verte, ou à la demande. Personne n'a lu le rapport de fin de run : ce commentaire est ce que le relecteur humain lira en premier.

1. **Périmètre** : la PR doit être la branche courante (`gh pr view <numéro> --json number,headRefName,baseRefName,url`), sinon arrête-toi. Base = `baseRefName`. Les relecteurs relisent `git diff <base>...HEAD`, tel que livré : base reprise, correctifs de CI et archive compris.
2. **Relecteurs et filtre** : étapes 2 et 3 ci-dessus, avec des sous-agents neufs. Ne leur donne ni le rapport de fin de run ni ses constats : la revue du run ne doit pas orienter celle-ci.
3. **Rien n'est corrigé** : la PR est publiée, un correctif passe par l'utilisateur (« Correctif après l'archive » de `/hx-ship`).
4. **Commentaire** : écris-le dans un fichier temporaire hors du dépôt, au format ci-dessous, puis `gh pr comment <numéro> --body-file <fichier>`.
5. **Rends** à `/hx-ship` le nombre de bloquants confirmés.

```markdown
## Revue automatique · <change>

> **<✅ Prête pour relecture humaine | ⛔ Changements demandés : N bloquant(s)>**
> <une phrase : ce que la PR fait, et le point qui mérite le plus l'œil du relecteur>

| Confiance | Piste | Tâches | `hx check` | Trace | Relecteurs |
|---|---|---|---|---|---|
| <score>/100 (seuil <seuil>) | M | N/N | vert | X/Y scénarios | spec · code · sécurité <si lancé> |

### Constats sur la PR
| # | Gravité | Fichier:ligne | Constat | Correction proposée |
|---|---|---|---|---|
| 1 | 🔴 bloquant | `src/x.ts:42` | … | … |
| 2 | 🟠 important | … | … | … |
| 3 | 🟡 mineur | … | … | … |

### À confirmer par le relecteur
- **Hypothèse** <choix que la spec ne tranchait pas> → <option retenue> (`<fichier>`)
- **Mineur du run, non appliqué** <constat> (`<fichier:ligne>`)

### Historique du run
<n> tours de revue · <n> constats corrigés pendant le run · <n> mineurs appliqués · <n> écartés · pénalités de confiance : <liste, ou aucune>

<details><summary>Constats écartés (<n>)</summary>

- `<fichier:ligne>` <constat> : <raison d'une ligne>

</details>

---
<sub>Relecteurs indépendants du harness, constats confirmés ligne à ligne. Ne remplace pas l'approbation humaine. Corriger : « Correctif après l'archive » de /hx-ship.</sub>
```

Une section sans contenu garde son titre avec « Aucun ». Tableau des constats trié par gravité ; pas de constat sans ligne précise.
