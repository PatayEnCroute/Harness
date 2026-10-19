# ADR-004 : OpenSpec comme dépendance centrale, avec critères de sortie

- Statut : Accepté
- Date : 2026-10-18

## Besoin
Garder une trace durable de l'intention (exigences, scénarios testables, changes en cours) que l'agent et le développeur partagent, sans écrire ni maintenir un format maison.

## Contexte
- OpenSpec est le pari le plus lourd du template : le workflow M/L, la trace et le contrôle des pistes en dépendent.
- Le projet est jeune et rapide : environ une release par semaine. Ses commandes ont déjà été remplacées par des skills (#2022).
- Le harness s'y couple à quatre endroits :

| Point de couplage | Où | Ce qui casse si le format change |
|---|---|---|
| Markdown des specs et des deltas (`## ADDED Requirements`, `#### Scenario:`) | `parseScenarios`, `collectScenarios` (`hx.mjs`) | `hx trace`, la couverture de la CI |
| `.openspec.yaml` plat et clés maison `x-track`, `x-validated` | `readChangeMeta`, `checkPolicy` | Contrôle des pistes, contexte de session |
| Cases de `tasks.md` | `taskProgress` | Contexte de session |
| CLI : `init`, `update`, `validate`, `list --json`, `instructions apply --json`, `archive` | `copier.yml`, `hx check`, skills `hx-implement` et `hx-ship` | Installation, `hx check`, le workflow M |

## Options
| Option | Coût | Rend plus facile | Rend plus difficile | Réversible ? |
|---|---|---|---|---|
| **OpenSpec épinglé, contrat testé** | faible : une montée de version à vérifier de temps en temps | specs lisibles, outillage maintenu par d'autres, skills `/opsx:*` | suivre un projet rapide ; parser son Markdown | oui : les specs restent du Markdown |
| Format maison (specs Markdown + `hx`) | élevé : parser, valider, archiver, documenter | maîtrise totale | tout maintenir seul, perdre l'écosystème | oui |
| Spec Kit, Kiro ou autre | moyen : réécrire skills, trace et contrôles | selon l'outil | même risque de dépendance, en moins bien connu | oui |
| Pas de specs (tests seuls) | nul | rien à suivre | perte de l'intention, pistes M/L sans support | oui |

## Décision
OpenSpec, avec trois garde-fous :

1. **Une seule version épinglée**, calculée dans `copier.yml` (`openspec_version`, `when: false`). `copier update` la propage dans `.harness/versions.json`. `hx openspec`, les hooks et la CI l'utilisent.
2. **Chaque hypothèse est vérifiée** par `tests/openspec-contract.test.mjs`, qui lance la version épinglée en vrai. Le harness ne touche jamais aux fichiers `openspec-*` générés.
3. **Les extensions passent par des voies prévues** : `config.yaml` (`context`, `rules`), clés `x-*` dans `.openspec.yaml`, skills voisins. Jamais de fork.

## Conséquences
- Plus facile : specs, deltas et archive viennent d'un outil maintenu ; le harness n'ajoute que ses contrôles.
- Plus difficile : le harness suit le rythme des versions d'OpenSpec, chacune passant par la procédure ci-dessous.

## Montée de version
1. Lire le CHANGELOG d'OpenSpec : format des specs, `.openspec.yaml`, sorties `--json`, commandes.
2. Changer `openspec_version` dans `copier.yml`. Les e2e et le test de contrat la lisent à cet endroit.
3. `npm test && npm run test:contract && npm run e2e`. Un test de contrat rouge désigne l'hypothèse cassée : adapter le code `hx` concerné dans le même commit.
4. Noter la montée dans `CHANGELOG.md`. Les projets la reçoivent au prochain `copier update`.

## Critères de sortie
Je réévalue cette décision (format maison ou autre outil) si l'un de ces signaux apparaît :

- deux montées de version consécutives cassent le test de contrat sur le format des specs ou de `.openspec.yaml` ;
- le Markdown des specs cesse d'être la source lisible (base de données, format binaire, service distant obligatoire) ;
- la CLI exige un compte, un réseau ou une télémétrie impossible à couper ;
- le projet n'a plus de release depuis 6 mois, ou change de licence vers une licence non libre ;
- l'usage réel montre que les pistes M/L passent à côté d'OpenSpec : moins de la moitié des changes M avec une delta spec.

## Stratégie de sortie
Les specs restent des fichiers Markdown dans le dépôt : rien n'est perdu. La sortie consisterait à :

1. figer la dernière version qui marche ;
2. remplacer les appels CLI (`validate`, `archive`) par des sous-commandes `hx`, sur le format déjà parsé par `parseScenarios` ;
3. retirer les skills `/opsx:*` au profit de `hx-*`.

La trace et le contrôle des pistes ne bougent pas : ils lisent déjà le Markdown directement.
