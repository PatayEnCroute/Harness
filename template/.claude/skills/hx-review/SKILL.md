---
name: hx-review
description: Fait relire un changement par des sous-agents indépendants (conformité à la spec, qualité et architecture, sécurité si pertinent), vérifie chaque constat pour écarter les faux positifs, puis consolide. À utiliser après hx-verify et avant de livrer, à la demande sur une branche, ou avec --pr pour publier la revue d'une PR en commentaire (livraison automatique).
argument-hint: "[branche de base, par défaut main] | --pr <numéro>"
---

# hx-review : relecture indépendante

Celui qui a écrit le code ne le juge pas. Les relecteurs n'ont pas ton contexte : c'est voulu.

## Étapes

Avec `--pr <numéro>` : suis la section « Revue d'une PR », plus bas.

1. **Périmètre** : base = `$ARGUMENTS`, sinon `default_branch` de `.copier-answers.yml`, sinon `main`. Lance `git diff <base>...HEAD --stat` et identifie le change OpenSpec concerné.
2. **En parallèle** :
   - `hx-spec-reviewer`, si un change OpenSpec est concerné ;
   - `hx-code-reviewer`, toujours ;
   - `hx-security-reviewer`, si le diff touche des entrées externes, l'authentification, des données personnelles, des secrets, des dépendances, la CI ou l'infrastructure.
3. **Filtre** : les trois relecteurs emploient la même échelle (`bloquant`, `important`, `mineur`). Pour chaque constat bloquant ou important, va lire la ligne citée et confirme-le toi-même. Écarte ce que tu ne peux pas confirmer, avec une raison d'une ligne.
4. **Corrige** les constats bloquants et importants confirmés, en TDD (`hx-tdd`), puis relance `hx-verify`. Un important dont la correction sortirait du change (autre feature, refonte) n'est pas corrigé : il rejoint les mineurs proposés, marqué `important`, avec sa raison.
5. **Mineurs** : ne les corrige pas sans l'accord de l'utilisateur, et ne lui pose pas la question en cours de run. Liste-les dans le rapport, qui se termine par la question. Tant qu'elle n'a pas de réponse, pas d'archive ni de livraison, même si l'utilisateur a demandé la PR d'avance : un correctif commité après l'archive l'empêche d'être le dernier commit. Seule exception : la livraison automatique (ci-dessous), qui n'en applique aucun et les publie dans la revue de la PR.

## Rapport de fin de run

C'est le dernier message du run : l'utilisateur doit pouvoir décider en quelques minutes, sans relire la conversation.

Si un change OpenSpec est concerné, le rapport survit aussi à la session :

1. Écris-le dans `openspec/changes/<change>/run-report.md` (remplacé à chaque run). `/hx-ship` le relit, `hx status` en affiche le verdict.
2. Ajoute à son `.openspec.yaml` les mesures du run, lues par `hx stats` et `hx confidence` (des entiers, 0 compris) :
   - `x-review-confirmed: <n>` : bloquants et importants confirmés ;
   - `x-review-discarded: <n>` : écartés à l'étape 3 ;
   - `x-review-minors: <n>` : mineurs proposés, importants reportés compris ;
   - `x-review-deferred: <n>` : importants reportés hors du change (étape 4) ;
   - `x-run-assumptions: <n>` : hypothèses à confirmer.
3. **Livraison** : `node .harness/hx.mjs confidence <change>`. Recopie sa sortie dans la section « Livraison » du rapport. Revue non indépendante (sans sous-agents, voir `hx-implement`) : livraison par l'utilisateur, quel que soit le score.
4. Commite le rapport et `.openspec.yaml` : `<change> : rapport de fin de run`.
5. **Sortie 0** (livraison automatique) : enchaîne `/hx-ship <change>` sans rendre la main. **Sortie 1** : le rapport est ton dernier message, et se termine par sa question.

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

### Livraison
<sortie de hx confidence : score, seuil, exclusions, pénalités>

Applique-t-on ces mineurs : tous, une partie (lesquels) ou aucun ?

### Prochaine étape
Ta décision sur les mineurs, puis /hx-ship <change> ; ou ce qu'il faut trancher ; ou « livraison automatique : /hx-ship lancé »
```

Les sections vides restent, avec « Aucune » : une absence de constat est aussi une information. Sans mineur, ou en livraison automatique, la question disparaît.

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
<n> constats corrigés pendant le run · <n> écartés · pénalités de confiance : <liste, ou aucune>

<details><summary>Constats écartés (<n>)</summary>

- `<fichier:ligne>` <constat> : <raison d'une ligne>

</details>

---
<sub>Relecteurs indépendants du harness, constats confirmés ligne à ligne. Ne remplace pas l'approbation humaine. Corriger : « Correctif après l'archive » de /hx-ship.</sub>
```

Une section sans contenu garde son titre avec « Aucun ». Tableau des constats trié par gravité ; pas de constat sans ligne précise.
