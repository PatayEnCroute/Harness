---
name: hx-setup
description: Personnalise le harness pour la stack du projet. Détecte les composants, vérifie chaque commande en l'exécutant, établit le profil d'architecture, rédige les rules de stack, l'outillage CI et la carte du projet. À lancer après l'installation du template, ou pour ajouter ou corriger un composant.
argument-hint: "[consigne facultative, ex. « ajoute le composant web »]"
disable-model-invocation: true
allowed-tools: Bash(node .harness/hx.mjs *)
---

# /hx-setup : personnaliser le harness pour ce projet

Tu remplis **uniquement les fichiers spécifiques au projet**. Tous les autres sont gérés par le template et ne doivent pas être modifiés ici.

| Fichier spécifique | Contenu |
|---|---|
| `.harness/config.json` | Composants, commandes, profil d'architecture, couverture de trace |
| `.harness/project.md` | Carte du projet (importée par `CLAUDE.md`) |
| `.claude/rules/stack-<composant>.md` | Conventions propres à la stack d'un composant |
| `.harness/ci/setup/action.yml` | Outillage CI de la stack |
| Configuration `arch` du projet | Par exemple `.dependency-cruiser.cjs`, contrats import-linter, projet de tests d'architecture |

Fichiers à **ne pas modifier** : `CLAUDE.md`, `.harness/hx.mjs`, `.harness/hooks.mjs`, `.harness/config.schema.json`, `.harness/versions.json`, `openspec/config.yaml`, `.claude/settings.json`, `.claude/rules/{openspec,testing,architecture}.md`, `.claude/skills/hx-*`, `.claude/agents/hx-*`, `.github/workflows/hx-check.yml`.

Si l'utilisateur a passé une consigne (`$ARGUMENTS`), concentre-toi dessus et ne refais que les étapes utiles.

## Règles

1. **Une commande n'entre dans le contrat que si elle a été exécutée avec succès.** Sinon, elle n'y entre qu'après accord explicite de l'utilisateur, qui connaît l'échec.
2. **Commande fausse ≠ code en échec.** Si `test` échoue parce que des tests sont rouges, la commande est juste : signale l'échec, ne change pas la commande pour qu'elle ne teste plus rien.
3. **Préférer ce que le projet utilise déjà** (scripts du manifeste, Makefile, justfile, CI existante) aux commandes génériques.
4. **Un composant = une unité qui se teste ou se construit indépendamment.** Pas plus de composants que nécessaire.
5. **Au plus 4 questions**, regroupées en un seul message, chacune avec une proposition par défaut.
6. **N'écris que ce qu'un agent ne devinerait pas seul.** Les conventions standard de la stack n'ont rien à faire dans les rules ou la carte.

## Étapes

### 1. État des lieux

```bash
node .harness/hx.mjs detect --json
```

Lis aussi `.harness/config.json`, `.harness/project.md`, le README, les manifestes, la CI existante (`.github/workflows/`, `Makefile`, `justfile`, `scripts/`).

**Projet existant** : l'installation a pu remplacer des fichiers du projet. Pour chacun, compare avec la version d'avant l'installation (`git diff HEAD -- <fichier>` tant qu'elle n'est pas commitée, sinon `git show HEAD~1:<fichier>`) et récupère ce qui compte :

| Fichier remplacé | Ce qu'il faut récupérer | Où le remettre |
|---|---|---|
| `CLAUDE.md` | Consignes propres au projet | `.harness/project.md` ou `.claude/rules/stack-*.md` |
| `.claude/settings.json` | `permissions`, `model`, `env`, hooks du projet | Fusion dans `.claude/settings.json` (les hooks du harness restent) ; ce qui est personnel va dans `.claude/settings.local.json` |
| `openspec/config.yaml` | `context` métier, `rules` propres au projet | `.harness/project.md` (le `context` du template y renvoie) |
| `.github/workflows/hx-check.yml` | — (nouveau fichier) | — |

Montre chaque récupération à l'utilisateur avant de l'écrire.

### 2. Compléter la détection

La détection est un point de départ déterministe : vérifie-la et complète-la.

| Commande | Rôle | Attendu |
|---|---|---|
| `setup` | Installer les dépendances | recommandé |
| `test` | Toute la suite de tests du composant | **obligatoire** |
| `test-file` | Un fichier de test ; reçoit `{file}` (chemin relatif au composant) | recommandé |
| `lint` | Lint ou vérification de format | recommandé |
| `lint-file` | Lint d'un fichier ; reçoit `{file}`. Sert au hook après chaque édition : il doit être rapide | recommandé |
| `typecheck` | Typage statique, s'il existe hors build | facultatif |
| `build` | Compilation ou bundle | facultatif |
| `arch` | Règles de dépendance (étape 7) | selon le besoin |

Les commandes s'exécutent **dans le dossier du composant** (`path`) : pas de `--prefix` ni de `cd`.

### 3. Proposer et questionner

Présente un tableau composants × commandes, avec les remarques de la détection. Puis pose les questions utiles parmi :

- les commandes manquantes ou ambiguës ;
- la **durée de vie** du projet : `throwaway`, `medium` ou `long` ;
- la **complexité métier** : `low`, `medium` ou `high`.

### 4. Écrire le contrat

```bash
node .harness/hx.mjs detect --write            # contrat vide
node .harness/hx.mjs detect --write --force    # remplacer, seulement si l'utilisateur l'a validé
```

Puis édite `.harness/config.json` pour appliquer les corrections validées.

### 5. Vérifier par l'exécution

```bash
node .harness/hx.mjs run setup     # si défini
node .harness/hx.mjs doctor
```

Pour chaque échec :

- **commande fausse** : corrige-la, puis relance ;
- **code en échec** (tests rouges, lint déjà en échec) : montre l'erreur et demande à l'utilisateur de choisir entre corriger maintenant, garder la commande (l'échec restera visible) ou retirer la commande.

Recommence jusqu'à ce que `doctor` n'ait plus d'erreur, hors choix explicites de l'utilisateur.

### 6. Profil d'architecture

Renseigne `architecture` dans `.harness/config.json`. Le **besoin** décide, pas la mode.

| Niveau | Quand |
|---|---|
| 0 · Simple | Script, POC, outil jetable |
| 1 · Feature-first *(défaut)* | Cas général : un dossier par feature, tranche verticale complète, pas d'abstraction |
| 2 · Feature + domaine isolé | Feature aux règles métier riches, ou I/O externe à isoler pour tester |
| 3 · Monolithe modulaire clean | Plusieurs sous-domaines, longue durée de vie, changements fréquents et indépendants |
| 4 · Distribué | Déjà imposé : services déployés séparément (équipes, déploiement ou charge indépendants). Jamais par anticipation |

- `profile.size` : pars de `stats.sizeHint` de la détection, ajuste avec l'utilisateur.
- `level` : niveau par défaut du projet ; `features` : seulement les écarts justifiés (ex. `"facturation": 2`).
- **Projet neuf** : si le besoin dépasse le niveau 1, lance `hx-architect`.
- **Projet existant** : décris l'architecture telle qu'elle est. Si elle s'écarte du feature-first (par exemple des couches techniques à la racine), note l'écart dans la carte. Ne propose pas de refonte ici.

### 7. Règles de dépendance (`arch`)

Suis `references/arch-rules.md`. Ne configure `arch` que si le besoin existe : niveau ≥ 2 pour au moins une feature, ou plusieurs features dont les frontières comptent. Vérifie que la règle échoue sur une violation volontaire, puis retire cette violation.

### 8. Rules de stack

Pour chaque composant, crée `.claude/rules/stack-<composant>.md`, avec `paths: ["<path>/**"]` en frontmatter et **30 lignes au plus**. Contenu :

- idiomes et pièges **propres à ce projet** (versions, frameworks, conventions de nommage observées) ;
- où vivent les tests, comment ils sont nommés ;
- ce qu'il ne faut pas faire dans ce code.

Rien de générique à la stack : l'agent le sait déjà.

### 9. Outillage CI

Si `.harness/ci/setup/action.yml` existe, remplace son étape d'avertissement par les étapes de `references/ci-setup.md` pour les stacks des composants. Node est déjà installé par le workflow.

### 10. Trace sur un projet existant

Si `openspec/specs/` contient déjà des scénarios sans test tagué (`node .harness/hx.mjs trace`), fixe `trace.min_coverage` à la couverture actuelle (cliquet) et dis-le à l'utilisateur. La valeur ne doit que monter ensuite.

### 11. Carte du projet

Réécris `.harness/project.md` en **40 lignes au plus** et **supprime le marqueur `hx:todo`** :

- **En une phrase** : ce que fait le projet, pour qui.
- **Composants** : tableau nom, chemin, stack, rôle.
- **Points d'entrée** : où démarre l'application, la CLI, les jobs ; comment la lancer localement.
- **Tests** : où ils vivent.
- **Conventions propres au projet** : seulement celles qui sont non standard.
- **Architecture** : niveau, features en écart, écarts constatés.

### 12. Conclure

```bash
node .harness/hx.mjs doctor
node .harness/hx.mjs check
```

Montre `git diff --stat`, les sorties de `doctor` et de `check`, et les avertissements restants. Propose le commit `chore: personnalise le harness (hx-setup)`.
