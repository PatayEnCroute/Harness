# Revue d'élagage

> Principe P9 : chaque composant encode une hypothèse sur une faiblesse du modèle. On mesure son apport, et on le retire quand il ne sert plus. Un composant inutile coûte du contexte et de l'attention.

## Méthode

1. **Mesurer** : `evals/run.sh --runs 10 <scénario>`, puis la même commande avec `--without <skill>` (en dessous de 10 exécutions, 90 % et 70 % de réussite ne se distinguent pas). Chaque campagne écrit ses résultats dans `evals/results/` ; commite ceux qui fondent une décision.
2. **Décider** :

   | Résultat | Décision |
   |---|---|
   | La réussite baisse sans le skill | On le garde |
   | La réussite est égale et le coût baisse sans le skill | Candidat au retrait |
   | La réussite est égale et le coût est égal | On simplifie le skill, ou on le retire |

3. **Quand** : à chaque nouvelle génération de modèle, et au plus tard tous les trimestres.
4. **Tracer** : chaque retrait ou simplification est noté dans le journal ci-dessous, avec la mesure qui le justifie (fichier de `evals/results/`).

## Hypothèses par composant

| Composant | Hypothèse encodée (faiblesse compensée) | Mesure | Signal de retrait |
|---|---|---|---|
| `hx-triage` | Le modèle sur-processe les petits changements, ou sous-spécifie les gros | eval `tdd-s` (pas de change pour un petit changement) | Le modèle choisit la bonne piste sans le skill |
| `hx-tdd` | Le modèle écrit le code avant le test, ou des tests qui ne peuvent pas échouer | eval `tdd-s` avec `--without hx-tdd` | Réussite égale sans le skill |
| `hx-implement` | Le contexte se dégrade sur un long change ; le modèle sort de la spec | eval `implement-m` | Réussite égale sans le skill, sur un change de 5 tâches ou plus |
| `hx-verify` + hook `Stop` | Le modèle déclare « terminé » sans preuve | evals `tdd-s`, `implement-m` : `hx check` vert à la fin | Plus aucun échec de `check` en fin d'eval sans le skill |
| Porte de cadrage (`x-validated`) | Le modèle spécifie autre chose que la demande, puis l'implémente fidèlement | corrections demandées à la porte ; hypothèses du rapport de fin de run infirmées par l'utilisateur | Aucune correction à la porte sur un trimestre |
| Contre-relecture du cadrage (`hx-architect` relecteur, M avec `design.md` et L) | Le modèle sur-dimensionne le cadrage (scénarios, configuration, composants sans besoin exprimé) et ne le conteste pas lui-même | décisions retirées par la contre-relecture ; réécritures demandées à la porte pour sur-dimensionnement | Aucune décision retirée sur un trimestre |
| `hx worktree` | Deux changes dans un même dossier se gênent (trace, pistes, commits) | runs interrompus par un change voisin | — (contrôle déterministe, coût quasi nul) |
| `hx-review` + reviewers | Le modèle juge mal son propre travail | constats confirmés par revue (`hx-review`) | Moins d'un constat confirmé par PR sur un trimestre |
| Rule `comments.md` + catégorie « Commentaires » de `hx-code-reviewer` + lint des commentaires (`hx-setup`) | Le modèle paraphrase le code en commentaires et ne les met pas à jour : ils finissent par le contredire | constats « Commentaires » confirmés par `hx-review` ; violations du lint en fin de tâche | Aucun constat confirmé sur un trimestre (le lint, déterministe, reste) |
| `hx-architect` + rule `architecture.md` | Le modèle sur-conçoit (patterns par réflexe) | eval `architect` | Le modèle reste proportionné sans eux |
| `hx-setup` | La personnalisation à la stack est longue et sujette à erreur | eval `setup` | — (gain de temps, pas de faiblesse du modèle) |
| `hx trace` | Les specs et le code divergent | `hx check` en CI | — (contrôle déterministe, coût quasi nul) |
| Hook `PostToolUse` (lint du fichier) | Les erreurs de lint s'accumulent jusqu'à la fin | nombre d'échecs `lint` en fin de tâche | Le lint final passe toujours sans le hook |
| Hook `Stop` (chemins protégés) | Le modèle contourne une protection par un chemin que `PreToolUse` ne voit pas (`cd`, script) | signalements à l'utilisateur sur un trimestre | — (contrôle déterministe, coût quasi nul) |
| `hx-learn` → `docs/learnings/` relu par `hx-triage` et `hx-clarify` | Les leçons d'un incident sont oubliées au change suivant | même correction demandée deux fois | Aucune leçon relue n'a changé une décision sur un trimestre |

Les contrôles déterministes (`hx check`, trace, pistes, archives) coûtent peu et ne dépendent pas du modèle : ils restent.

## Candidats non construits

Trous possibles du workflow, **non construits** : on n'ajoute un composant que si l'usage en montre le besoin, avec une mesure.

| Candidat | Signal qui le justifierait |
|---|---|
| Rollback et migration de données en piste L (`hx-ship`, `hx-adr`) | Une migration livrée sans plan de retour arrière |
| Revue de performance (`hx-code-reviewer` ou relecteur dédié) | Une régression de performance passée en revue |
| Étape docs / CHANGELOG dans la piste M | Une PR mergée avec une doc utilisateur périmée |

## Journal

| Date | Composant | Décision | Mesure |
|---|---|---|---|
| 2026-10-18 | Plugin utilisateur | Non construit ([ADR-003](adr/003-plugin-utilisateur-non-retenu.md)) | Besoin non observé |
| 2026-10-18 | Génération multi-outils | Non construite ([ADR-002](adr/002-claude-code-seul-standards-gratuits.md)) | Un seul outil utilisé |
| 2026-10-18 | Ligne de base | 4/4 evals vertes, une exécution chacune (`architect`, `setup`, `tdd-s`, `implement-m`), environ 1,10 $ au total | Première mesure, **non archivée** (antérieure à `evals/results/`) ; à répéter avec `--runs 10` et en A/B |
| 2026-10-18 | Ligne de base `--runs 10` (variante complète, `claude-sonnet-5-5`) | Mesures brutes : `architect` 10/10 · `implement-m` 10/10 (a8ef3b2) · `setup` 10/10 (416decb) · `tdd-s` 8/10 (bcf700c ; 2 échecs attribués au correcteur `test-first`, corrigé depuis, **sans nouvelle mesure**). **Les 4 scénarios ont été mesurés avant le durcissement des correcteurs** (`architect` : cf88fda ; `tdd-s` : 2d52145 ; tous : 79f8dd7, 464328c) : ces chiffres ne valent pas pour v0.3.0, et les échecs n'ont pas de `reason` enregistrée. 11,74 $ en tout, échecs et relances compris | `evals/results/20261018T2029*` (a8ef3b2), `…205427*` et `…205546*` (bcf700c, `architect` 1/1 de contrôle), `…2108*` (416decb). Les campagnes ont révélé et fait corriger 2 défauts du hook `PreToolUse` (`setup` 0/6 puis 9/10) et 2 du correcteur `test-first`. Prochaine étape : A/B `--without` par composant |
| 2026-10-19 | `implement-m` après la porte de cadrage et le run enchaîné (0df52c3, `claude-sonnet-5-5`) | 10/10, comme avant (a8ef3b2 : 10/10). Coût moyen 0,53 $ contre 0,39 $ (+37 %) : `hx-implement` enchaîne désormais `hx-verify` et `hx-review` | [`20261018T235030Z-full.jsonl`](../evals/results/20261018T235030Z-full.jsonl) ; correcteurs inchangés depuis v0.3.0 |
