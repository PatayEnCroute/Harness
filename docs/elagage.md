# Revue d'élagage

**Chaque composant compense une faiblesse du modèle.** Quand le modèle progresse, le composant peut devenir inutile, et il coûte alors du contexte et de l'attention pour rien. On mesure donc son apport, et on le retire quand il ne sert plus (principe P9).

---

## Méthode

```mermaid
flowchart LR
  M["1. Mesurer<br/>hx stats · evals A/B"] --> D{"2. Décider"}
  D -->|réussite en baisse<br/>sans le composant| K[Garder]
  D -->|réussite égale,<br/>coût en baisse| R[Retirer]
  D -->|réussite égale,<br/>coût égal| S[Simplifier ou retirer]
  K & R & S --> J["3. Tracer<br/>dans le journal"]
```

| Étape | Comment |
|---|---|
| **Mesurer** | Usage réel : `node .harness/hx.mjs stats` dans un projet. Effet d'un skill : `evals/run.sh --runs 10 <scénario>`, puis la même chose avec `--without <skill>`. |
| **Quand** | À chaque nouvelle génération de modèle, au plus tard chaque trimestre. |
| **Veille** | Relire le changelog de Claude Code : un composant devenu natif se retire (P13). |
| **Tracer** | Chaque retrait ou simplification va dans le [journal](#journal), avec sa mesure (fichier de `evals/results/`, commité). |

> **Pourquoi 10 exécutions ?** En dessous, 90 % et 70 % de réussite ne se distinguent pas.

---

## Ce que chaque composant compense

### Workflow

| Composant | Faiblesse compensée | Mesure | On retire si… |
|---|---|---|---|
| `hx-triage` | Sur-processer les petits changements, sous-spécifier les gros | eval `tdd-s` | le modèle choisit la bonne piste sans lui |
| `hx-tdd` | Code avant le test, ou tests qui ne peuvent pas échouer | eval `tdd-s --without hx-tdd` | réussite égale sans lui |
| `hx-implement` | Contexte dégradé sur un long change, sortie de la spec | eval `implement-m` | réussite égale sans lui, sur ≥ 5 tâches |
| `hx-verify` + hook `Stop` | « Terminé » déclaré sans preuve | `hx check` vert en fin d'evals | plus aucun échec de `check` sans lui |
| Hook `PostToolUse` | Erreurs de lint accumulées jusqu'à la fin | échecs `lint` en fin de tâche | le lint final passe toujours sans lui |
| Journal de run + reprise après compactage | Hypothèses perdues par un compactage, décisions ignorées d'une tâche à l'autre, reprise à l'aveugle | eval `resume-run` | Claude Code garde l'état du run à travers un compactage sans lui |

### Cadrage

| Composant | Faiblesse compensée | Mesure | On retire si… |
|---|---|---|---|
| Porte de cadrage | Spécifier autre chose que la demande, puis l'implémenter fidèlement | `x-gate-corrections` ; hypothèses du rapport infirmées ; eval `gate-stops` | aucune correction à la porte sur un trimestre |
| Contre-relecture (`hx-architect`) | Cadrage sur-dimensionné, jamais contesté par son auteur | `x-gate-removed` | aucune décision retirée sur un trimestre |
| `hx-architect` + rule `architecture` | Patterns par réflexe | eval `architect` | le modèle reste proportionné sans eux |

### Revue et mémoire

| Composant | Faiblesse compensée | Mesure | On retire si… |
|---|---|---|---|
| `hx-review` + relecteurs | Mal juger son propre travail | `x-review-confirmed` / `x-review-discarded` | < 1 constat confirmé par PR sur un trimestre |
| Boucle de correction (`hx-review`) | Corrections jamais relues, mineurs laissés à l'humain alors qu'ils bloquent la livraison seule | `x-review-rounds` ; constats confirmés aux tours 2 et plus | aucun constat confirmé après le tour 1 sur un trimestre (la boucle ne fait plus qu'appliquer les mineurs) |
| Rule `comments` + relecteur | Commentaires qui paraphrasent le code, puis le contredisent | constats « Commentaires » confirmés | aucun sur un trimestre (le lint reste) |
| `hx-learn` | Leçons d'un incident oubliées au change suivant | même correction demandée deux fois | aucune leçon relue n'a changé une décision sur un trimestre |
| `hx-dream` | Leçons accumulées sans relecture : redites, périmées, noyées | charge avant/après ; leçons réapprises | rien à condenser sur un trimestre (une leçon réapprise = il élague trop) |

### À la demande

| Composant | Faiblesse compensée | Mesure | On retire si… |
|---|---|---|---|
| `hx-security-audit` | Rapport gonflé : CVE non vérifiées, injections sans chemin d'entrée | constats confirmés par l'utilisateur | mêmes constats, sans plus de faux positifs, sans lui |
| `hx-explain` | Jargon, justification après coup, bilan complaisant | question de compréhension après l'explication ; conseils appliqués | explications aussi claires et bilan aussi honnête sans lui |

### Toujours gardés

Contrôles déterministes, quasi gratuits et indépendants du modèle, ou outils qui ne compensent aucune faiblesse : **pas de signal de retrait.**

| Composant | Rôle |
|---|---|
| `hx check`, `hx trace`, pistes, archives | Specs et code ne divergent pas |
| `hx worktree` | Deux changes ne se gênent pas dans un même dossier |
| `hx status` | L'utilisateur ne perd pas le fil des runs en cours |
| `hx confidence` + garde de `PreToolUse` | La livraison seule dépend de faits (fichiers, git), pas de l'avis de l'agent qui a codé |
| Version minimale de Claude Code, contrôle du sandbox (`hx doctor`) | Un run autonome ne tourne pas sur une version aux failles connues, ni sans isolation à l'insu de l'utilisateur. Minimum à relever à chaque nouvel avis de sécurité. |
| Hook `Stop` (chemins protégés) | Une protection contournée par Bash (`cd`, script) se voit quand même |
| `hx-setup` | Gain de temps, pas une faiblesse du modèle (eval `setup`) |
| `hx-update` | Gain de temps : mise à jour et conflits sans commande à taper |

---

## Candidats non construits

On n'ajoute un composant que si l'usage en montre le besoin.

| Candidat | Signal qui le justifierait |
|---|---|
| Rollback et migration de données en piste L | Une migration livrée sans plan de retour arrière |
| Revue de performance | Une régression de performance passée en revue |
| Étape docs / CHANGELOG en piste M | Une PR mergée avec une doc utilisateur périmée |

---

## Journal

| Date | Sujet | Résultat | Preuve |
|---|---|---|---|
| 2026-10-18 | Plugin utilisateur | Non construit | Besoin non observé ([ADR-003](adr/003-plugin-utilisateur-non-retenu.md)) |
| 2026-10-18 | Génération multi-outils | Non construite | Un seul outil utilisé ([ADR-002](adr/002-claude-code-seul-standards-gratuits.md)) |
| 2026-10-18 | Ligne de base, 1 exécution | 4/4 evals vertes, ~1,10 $ | **Non archivée** (antérieure à `evals/results/`) |
| 2026-10-18 | Ligne de base `--runs 10`, `claude-sonnet-5-5` | `architect` 10/10 · `implement-m` 10/10 · `setup` 10/10 · `tdd-s` 8/10. 11,74 $ au total. | `evals/results/20261018T2029*`, `…205427*`, `…205546*`, `…2108*` |
| 2026-10-19 | `implement-m` après la porte et le run enchaîné (0df52c3) | 10/10, inchangé. Coût moyen 0,53 $ au lieu de 0,39 $ (+37 %) : `hx-implement` enchaîne désormais verify et review. | [`20261018T235030Z-full.jsonl`](../evals/results/20261018T235030Z-full.jsonl) |
| 2026-10-27 | Repli des sous-agents dans une boucle unique (billet Anthropic du 22/10) | Non mené : 6 agents sur 7 vérifient ou explorent, des usages que le billet garde. Tester la boucle unique de `hx-implement` quand un change de 5 tâches ou plus paraît lent ou cher. | [`sous-agents-2026-10.md`](research/sous-agents-2026-10.md) |
| 2026-11-06 | Études sur l'industrie et le contexte | Nouvelles fonctions gelées jusqu'aux A/B : la valeur des skills qui compensent le modèle n'est pas démontrée face aux modèles forts. Phase P8 du [PLAN](PLAN.md#7-roadmap). | [`harness-industrie-2026-11.md`](research/harness-industrie-2026-11.md) |
| 2026-11-06 | Evals complètes (P8, étape 1) : effort, mode de permission, tokens, pic de contexte | `ship-minors` 0/3 (effort `low` une fois, défaut deux fois, ancien `run.sh` une fois) : régression depuis la garde de livraison du 30/10 (5a01b96), pas un effet de la mesure. Pic de contexte ~56 k tokens. | `evals/results/20261106T1910*`, `…1911*`, `…1912*` |
| 2026-11-07 | `ship-minors`, rouge depuis 5a01b96 (garde de `/hx-ship`) | **9/10**, 0,28 $ en moyenne. Cause : le hook `PreToolUse` refusait « Livre-le » tapé par l'utilisateur, que `CLAUDE.md` présente comme valant la commande, et l'agent contournait `/hx-ship` par Bash. Correctif 37fba94 : le hook `UserPromptSubmit` consigne « livre <change> » comme un clic. Archive hors `/hx-ship` : pas de détection ajoutée (décision utilisateur ; le hook `Stop` signale déjà `openspec/specs/` modifié). Échec restant : l'agent écarte le mineur du scénario, un JSDoc qui paraphrase le code, interdit par `comments.md` : défaut du scénario, pas de la garde. | [`20261107T022757Z-full.jsonl`](../evals/results/20261107T022757Z-full.jsonl) |
| 2026-11-07 | Campagne A/B de P8, étape 2 (`hx-triage`, `hx-tdd`, `hx-implement`), 78 exécutions | Référence en échec sous l'ancienne règle « zéro refus » (`gate-stops` 0/10, `implement-m` 0/8) : refus de permission (`python3 -c` derrière un pipe, boucles `for`, heredoc dans `.openspec.yaml`, `cd … &&`). Sous `acceptEdits` + permissions du template, l'eval est plus stricte que le mode Auto de l'utilisateur. Coûts des fichiers surévalués (plusieurs `result` cumulés additionnés, corrigé dans `metrics.mjs`) : coût réel ≈ 18 $. | `evals/results/20261107T0247*` |
| 2026-11-07 | Même campagne, **renotée sur le travail rendu** (refus comptés à part, sans nouvel appel au modèle) | `tdd-s` : complet **10/10**, sans `hx-triage` 7/10 (code avant le test), sans `hx-tdd` **2/10** (change OpenSpec pour un petit changement). `gate-stops` : complet **10/10**, sans `hx-triage` **0/10** (aucun change proposé). `implement-m` : complet **7/8**, sans `hx-implement` **0/10** (tâches non cochées). `hx-triage` et `hx-tdd` gardés : écarts bien au-delà du bruit (`hx-implement` : voir la correction plus bas). Réserves : trajectoires coupées par des refus ; `--without` retire aussi les lignes qui citent le skill ; hook `PostToolUse`, `ship-minors` et campagne Opus 5.5 non mesurés. | [`20261107T0247Z-renotation.txt`](../evals/results/20261107T0247Z-renotation.txt) |
| 2026-11-07 | Journal de run + reprise après compactage (P8, étape 3), eval `resume-run`, 10 exécutions | **10/10** : vrai `/compact`, tâche 1.2 faite sans refaire 1.1, hypothèse lue dans `run-log.md` citée par le rapport. 8/10 au premier passage : 2 faux négatifs de la notation (hypothèse reformulée « non entiers »), corrigée puis vérifiée sur un contrôle négatif. 1,35 $ par exécution, pic de contexte ~76 k tokens. Réserve : reprise demandée par l'utilisateur ; le compactage automatique sans message n'est couvert que par le test du hook. | [`20261107T031540Z-full.jsonl`](../evals/results/20261107T031540Z-full.jsonl) |
| 2026-11-07 | Sécurité du run autonome (P8, étape 4) : version minimale de Claude Code, sandbox opt-in dans `/hx-setup` | `setup` **3/3** avec la nouvelle étape 13 et les deux contrôles de `hx doctor` (contrôle de non-régression, pas une décision d'élagage). 0,25 $ par exécution. | [`20261107T143123Z-full.jsonl`](../evals/results/20261107T143123Z-full.jsonl) |
| 2026-11-07 | Complément de l'étape 2 : `ship-minors` (Sonnet) et A/B sur `claude-opus-5-5`, 70 exécutions | `ship-minors` **10/10**, 0 refus. Opus : `gate-stops` complet **10/10**, sans `hx-triage` **0/10** → `hx-triage` reste décisif. `tdd-s` complet 6/10, sans `hx-tdd` 0/10 : les 14 échecs créent un change OpenSpec, car `hx-triage` classe M « un comportement nouveau, sans specs » ; Opus applique cette règle, que le scénario (attendu S) contredit. `implement-m` complet 0/10 et sans `hx-implement` 0/10 : **invalide**, Opus crée le worktree puis `EnterWorktree` attend une permission impossible en `claude -p`. `PostToolUse` non mesurable : aucun `lint-file` dans le projet de démo. ≈ 28 $. | `evals/results/20261107T154229Z-full.jsonl`, `20261107T1603*` |
| 2026-11-07 | `implement-m` relancé sur Opus, prompt « ici, dans cette session » | **Avec `hx-implement` 10/10 à 2,14 $, sans 10/10 à 0,99 $** : réussite égale, coût ×2,2. **Correction** : le 0/10 de Sonnet sans `hx-implement` (renotation du même jour) venait du même piège (`EnterWorktree` impossible en `claude -p`, refus avant le code) ; la conclusion « `hx-implement` gardé » ne tient pas. `hx-implement` devient **candidat au repli** (P9 : réussite égale, coût en baisse), à confirmer avant tout retrait : Sonnet avec le prompt corrigé, et un change de 5 tâches liées ou plus (`implement-m` n'en a que 2, indépendantes). La notation ne mesure ni le journal de run ni la revue de conformité par tâche. | `evals/results/20261107T163306Z-full.jsonl`, `20261107T163308Z-without-hx-implement.jsonl` |
| 2026-11-07 | Revue d'élagage de P8 (étape 5) | **Rien n'est retiré** (décision de l'utilisateur) : `hx-implement` (candidat au repli), `hx-tdd` (rôle étroit sur la piste S) et `PostToolUse` (non mesurable) restent. Questions reportées à la prochaine revue. | [PLAN §7](PLAN.md#7-roadmap) |

<details>
<summary><b>Réserves sur la ligne de base du 2026-10-18</b></summary>

- Les 4 scénarios ont été mesurés **avant le durcissement des correcteurs** (cf88fda, 2d52145, 79f8dd7, 464328c) : ces chiffres ne valent pas pour v0.3.0, et les échecs n'ont pas de `reason` enregistrée.
- Les 2 échecs de `tdd-s` (bcf700c) sont attribués au correcteur `test-first`, corrigé depuis, **sans nouvelle mesure**.
- Commits mesurés : a8ef3b2 (`architect`, `implement-m`), bcf700c (`tdd-s`, plus `architect` 1/1 de contrôle), 416decb (`setup`).
- Ces campagnes ont révélé et fait corriger 2 défauts du hook `PreToolUse` (`setup` passé de 0/6 à 9/10) et 2 du correcteur `test-first`.
- Les correcteurs n'ont pas changé depuis v0.3.0, donc la mesure du 2026-10-19 est comparable.

**Prochaine étape** : A/B `--without` par composant.

</details>
