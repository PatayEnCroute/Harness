# Revue d'élagage

> Principe P9 : chaque composant encode une hypothèse sur une faiblesse du modèle. On mesure son apport, et on le retire quand il ne sert plus. Un composant inutile coûte du contexte et de l'attention.

## Méthode

1. **Mesurer** : `evals/run.sh --runs 3 <scénario>`, puis la même commande avec `--without <skill>`.
2. **Décider** :

   | Résultat | Décision |
   |---|---|
   | La réussite baisse sans le skill | On le garde |
   | La réussite est égale et le coût baisse sans le skill | Candidat au retrait |
   | La réussite est égale et le coût est égal | On simplifie le skill, ou on le retire |

3. **Quand** : à chaque nouvelle génération de modèle, et au plus tard tous les trimestres.
4. **Tracer** : chaque retrait ou simplification est noté dans le tableau ci-dessous, avec la mesure qui le justifie.

## Hypothèses par composant

| Composant | Hypothèse encodée (faiblesse compensée) | Mesure | Signal de retrait |
|---|---|---|---|
| `hx-triage` | Le modèle sur-processe les petits changements, ou sous-spécifie les gros | eval `tdd-s` (pas de change pour un petit changement) | Le modèle choisit la bonne piste sans le skill |
| `hx-tdd` | Le modèle écrit le code avant le test, ou des tests qui ne peuvent pas échouer | eval `tdd-s` avec `--without hx-tdd` | Réussite égale sans le skill |
| `hx-implement` | Le contexte se dégrade sur un long change ; le modèle sort de la spec | eval `implement-m` | Réussite égale sans le skill, sur un change de 5 tâches ou plus |
| `hx-verify` + hook `Stop` | Le modèle déclare « terminé » sans preuve | evals `tdd-s`, `implement-m` : `hx check` vert à la fin | Plus aucun échec de `check` en fin d'eval sans le skill |
| `hx-review` + reviewers | Le modèle juge mal son propre travail | constats confirmés par revue (`hx-review`) | Moins d'un constat confirmé par PR sur un trimestre |
| `hx-architect` + rule `architecture.md` | Le modèle sur-conçoit (patterns par réflexe) | eval `architect` | Le modèle reste proportionné sans eux |
| `hx-setup` | La personnalisation à la stack est longue et sujette à erreur | eval `setup` | — (gain de temps, pas de faiblesse du modèle) |
| `hx trace` | Les specs et le code divergent | `hx check` en CI | — (contrôle déterministe, coût quasi nul) |
| Hook `PostToolUse` (lint du fichier) | Les erreurs de lint s'accumulent jusqu'à la fin | nombre d'échecs `lint` en fin de tâche | Le lint final passe toujours sans le hook |

Les contrôles déterministes (`hx check`, trace, pistes, archives) coûtent peu et ne dépendent pas du modèle : ils restent.

## Journal

| Date | Composant | Décision | Mesure |
|---|---|---|---|
| 2026-10-18 | Plugin utilisateur | Non construit ([ADR-003](adr/003-plugin-utilisateur-non-retenu.md)) | Besoin non observé |
| 2026-10-18 | Génération multi-outils | Non construite ([ADR-002](adr/002-claude-code-seul-standards-gratuits.md)) | Un seul outil utilisé |
| 2026-10-18 | Ligne de base | 4/4 evals vertes, une exécution chacune (`architect`, `setup`, `tdd-s`, `implement-m`), environ 1,10 $ au total | Première mesure ; à répéter avec `--runs 3` et en A/B |
