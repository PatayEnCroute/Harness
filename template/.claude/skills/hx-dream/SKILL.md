---
name: hx-dream
description: Consolide la mémoire du projet sur le modèle du sommeil. Rejoue chaque apprentissage (notes de hx-learn, carte du projet, rules de stack, rapports de fin de run), oublie le périmé, le redondant et ce qu'un contrôle vérifie déjà, fusionne les épisodes en principes, hiérarchise par importance, puis propose un plan que l'utilisateur valide avant toute écriture. Hors workflow. À lancer explicitement, quand les leçons s'accumulent ou à chaque revue d'élagage, pour réduire la charge de contexte du harness.
argument-hint: "[vide : toute la mémoire du projet | dossier ou sujet]"
disable-model-invocation: true
---

# /hx-dream : consolider la mémoire du projet

Le cerveau ne garde pas tout : la nuit, il rejoue la journée, affaiblit ce qui n'a pas servi, transforme des souvenirs isolés en connaissances générales, relie des souvenirs éloignés, puis se réveille avec moins de bruit. `hx-dream` fait la même chose avec ce que le projet a appris. Le but : **moins de lignes à lire, et les bonnes en premier**.

## Ce qu'un vrai rêve fait, et pas ce rêve

- **Pas de fabulation.** Un rêve invente ; `hx-dream` non. Chaque phrase gardée ou fusionnée vient d'une source que tu cites. Aucun fait nouveau. Une association (phase 5) reste une hypothèse, marquée comme telle.
- **Oublier n'est pas perdre.** Une leçon retirée reste dans git : le journal donne le commit qui la contient.
- **« Rien à condenser » est un résultat valide.** Une mémoire déjà nette ne se réécrit pas pour justifier le rêve.
- **Rien ne s'écrit avant le réveil** : phases 1 à 5 en lecture seule, puis l'utilisateur valide le plan.

## La mémoire du projet

| Source | Analogie | Ce que le rêve peut en faire |
|---|---|---|
| `docs/learnings/*.md` (notes de `hx-learn`) | souvenirs récents | fusionner, promouvoir, oublier |
| `docs/learnings/harness.md` (propositions pour le template) | idées à transmettre | dédoublonner ; retirer celles que le template a livrées depuis (le skill, la rule ou le contrôle proposé existe dans le projet après `copier update`) |
| `.harness/project.md` (carte, chargée à **chaque** session) | mémoire de travail | condenser : la carte, pas l'historique |
| `.claude/rules/stack-*.md` (chargées par chemin) | savoir-faire | dédoublonner ; retirer ce qu'un lint ou un test vérifie |
| `openspec/changes/archive/*/run-report.md`, `node .harness/hx.mjs stats` | épisodes bruts | **lire seulement** : ce sont les traces de ce qui s'est passé |
| `docs/adr/`, `openspec/specs/` | décisions, comportement attendu | **jamais modifiés** ; un ADR périmé se remplace par un nouveau (`hx-adr`) |
| Fichiers du template (`CLAUDE.md`, `.claude/skills/hx-*`, agents, rules génériques, `.harness/*.mjs`) | l'inné | **jamais modifiés** ; un apprentissage générique devient une proposition dans `docs/learnings/harness.md` |

Périmètre : `$ARGUMENTS` s'il est donné (un dossier, un sujet), sinon toute la mémoire ci-dessus.

## Le cycle

### 1. Endormissement : inventaire

Liste chaque source et mesure la **charge** avec `wc -l` : lignes chargées à chaque session (`CLAUDE.md` et `.harness/project.md`), lignes des rules de stack, nombre et lignes des notes. Découpe chaque source en **apprentissages** : une affirmation qui peut changer une décision.

### 2. Sommeil lent : rejeu

Confronte chaque apprentissage au projet d'aujourd'hui, preuve à l'appui :

| Question | Comment le vérifier |
|---|---|
| Encore vrai ? | le fichier, la commande, le symbole cités existent (`git grep -n <terme>`, `git ls-files`) ; aucun commit ne l'a contredit (`git log --oneline -- <chemin>`) |
| Déjà vérifié par un contrôle ? | une commande du contrat (`.harness/config.json`), une règle de lint, un test ou un hook l'impose |
| Déjà écrit ailleurs ? | même idée dans une rule, une spec, un ADR, `CLAUDE.md` ou un skill |
| A-t-il servi ? | cité par un rapport de fin de run, par un commit, ou la même correction revenue (`git log --grep <mot>`) |

### 3. Homéostasie : élaguer

Le sommeil affaiblit les connexions inutiles pour que les utiles ressortent. **Oublie** un apprentissage :

- **périmé** : ce qu'il cite n'existe plus, ou le code l'a contredit ;
- **absorbé** : un contrôle déterministe l'impose déjà (le contrôle reste, la prose part) ;
- **redondant** : il est déjà écrit ailleurs, mieux placé ;
- **trivial** : le code, les tests ou la spec le disent déjà ; le supprimer ne fait rien perdre à un lecteur compétent.

Dans le doute, garde-le et dis pourquoi : oublier une leçon encore vraie coûte plus qu'une ligne de trop.

### 4. Consolidation : des épisodes aux principes

- **Fusionne** les notes sur un même sujet en une seule (15 lignes au plus, mots-clés du sujet dans le titre : `hx-triage` et `hx-clarify` les retrouvent par `git grep`), qui liste ses sources.
- **Généralise** : trois incidents de même cause font un principe, avec un exemple, pas trois récits.
- **Hiérarchise** par **saillance** : gravité (secret exposé, données perdues, régression livrée), puis récurrence, puis actualité. Le plus saillant vient en premier dans chaque fichier.
- **Range au bon niveau** : `project.md` ne garde que ce qui sert à chaque session ; ce qui ne vaut que pour certains fichiers part dans une rule ciblée par chemin.
- **Promeus** ce qui peut l'être, dans l'ordre de `hx-learn` : note → rule → contrôle déterministe. Un nouveau contrôle change le code ou le contrat : propose-le, il passera par `hx-triage`.

### 5. Sommeil paradoxal : associations

Cherche les liens entre apprentissages éloignés : la même cause racine dans deux features, deux règles qui se contredisent, une leçon de projet qui vaut pour tous les projets. **Trois hypothèses au plus**, chacune avec au moins deux sources citées et la suite proposée (rule, contrôle via `hx-triage`, proposition pour Harness). Pas de source, pas d'association.

### 6. Réveil : journal du rêve

Montre le plan en un message et **attends une validation explicite**. Une correction : ajuste le plan et remontre-le.

```markdown
## Rêve du <date> : <N> apprentissages rejoués

Charge : <lignes chargées à chaque session> → <après> · rules <avant> → <après> · notes <n> (<lignes>) → <n> (<lignes>)

| Apprentissage | Source | Verdict (garder, fusionner, promouvoir, déplacer, oublier) | Raison et preuve |
|---|---|---|---|

### Gardé en premier (le plus saillant)
1. <apprentissage> : <pourquoi il compte>

### Associations (hypothèses)
- <lien> : <sources> → <suite proposée> | Aucune

### Hors de ma portée
<propositions pour le template, contrôles à faire passer par hx-triage> | Rien
```

Validé : applique le plan. Une note fusionnée ou oubliée se retire avec `git rm <fichier>` (confirmé à chaque fois). Si une rule ou la carte a changé, lance `node .harness/hx.mjs check`. Puis un seul commit, `hx-dream : consolidation de la mémoire`, dont le corps reprend le tableau du journal : c'est lui qui retrouve ce qui a été oublié.

## Pièges

| Pensée | Réalité |
|---|---|
| « Je réécris tout, ce sera plus propre » | Une note nette reste telle quelle : réécrire coûte une relecture à l'utilisateur |
| « Je garde tout, au cas où » | Garder sans raison, c'est ne pas rêver : chaque verdict « garder » a sa raison |
| « J'ajoute la bonne pratique qui manque » | Rien d'inventé : seulement ce que les sources disent |
| « Je corrige `CLAUDE.md` ou un skill hx-* au passage » | Fichiers du template : proposition dans `docs/learnings/harness.md` |
| « Cette règle est vérifiée par le lint, je retire aussi le lint » | Le contrôle reste toujours ; seule la prose qui le répète part |
