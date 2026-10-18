# Changelog

Versions du template, au format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les projets reçoivent une version par `uvx copier update --trust`.

## [0.2.0] — non publiée

Corrections issues de la revue du 2026-10-18. Passage en 0.x : rien n'est encore éprouvé sur un vrai projet.

### Modifié
- **`hx check` n'est jamais vert sans test exécuté** : une étape `test` absente échoue, et un contrat invalide est refusé avant toute exécution (plus de plantage sur une commande mal typée).
- **Hook `Stop`** : contrôle seulement les composants dont Claude a édité du code pendant la session, au lieu de tout l'arbre git modifié et de tous les composants.
- **`tracks` du contrat enfin lu** par le contrôle des pistes : `spec`, `design` et `adr` par piste, pistes personnalisées acceptées ; tout ADR cité doit exister.
- **`openspec_version` calculée** (`when: false`) : une montée de version arrive enfin dans les projets existants au `copier update`.
- **Tâches OpenSpec** : un comportement par tâche, test et code ensemble ; plus de tâche « écrire le test » séparée ni de tâche finale « check vert ».
- **`hx-spec-reviewer`** relit `git diff --cached` : les fichiers nouveaux d'une tâche ne lui échappent plus.

### Ajouté
- **`hx doctor`** : parse `.claude/settings.json`, vérifie le câblage des 4 hooks et détecte les restes de conflit de `copier update` (marqueurs, `.rej`).
- **Hook `PreToolUse`** : confirmation avant d'écrire `.harness/config.json`, `hx.mjs`, `hooks.mjs` ou `.claude/settings*.json`, via Edit/Write ou par une commande Bash ; chemins résolus (liens symboliques).
- Contrat cassé : les hooks le signalent à Claude au lieu de se désactiver en silence.
- ADR-004 : OpenSpec comme dépendance centrale, procédure de montée de version et critères de sortie.
- Tests : 0 mutation survivante sur 26 dans `hx.mjs` et `hooks.mjs` (14 sur 14 survivaient avant) ; e2e `copier update` avec conflit dans la même zone et montée de version d'OpenSpec.

### Ajouté (suite de la revue, points importants)
- **Trace** : seul un tag `@scenario` dans un fichier de test couvre un scénario (`trace.test_pattern` pour une autre convention) ; les tags du code de production sont listés à part.
- **`hx doctor`** signale un projet en retard sur le dernier tag du template.
- **`hx migrate`**, lancé à chaque `copier update` : ajoute à `.harness/config.json` les clés nouvelles du template, sans rien remplacer.
- **Projet existant** : marche à suivre dans le README ; `/hx-setup` récupère depuis git `CLAUDE.md`, `.claude/settings.json` et `openspec/config.yaml` remplacés.
- **Workflow** :
  - piste S sans test rouge artificiel pour un refactor ou un renommage (tests existants verts avant et après), critères S harmonisés entre `CLAUDE.md` et `hx-triage` ;
  - `hx-security-reviewer` emploie la même échelle que les autres relecteurs ;
  - le skill `openspec-apply-change` demande confirmation et renvoie vers `hx-implement`.
- **CI du template** :
  - actions épinglées par SHA et Dependabot ;
  - `ANTHROPIC_API_KEY` limité à l'étape evals, claude-code épinglé ;
  - unitaires sur Linux, macOS, Windows et Node 20.19 ; `npm test` hermétique, contrat OpenSpec dans `npm run test:contract` ;
  - shellcheck, `concurrency`, `timeout-minutes`, push sur `main` seulement.
- **CI livrée** (`hx-check.yml`) : SHA, branche par défaut configurable (`default_branch`), `concurrency`, timeout, Dependabot ; ses étapes `run:` sont exécutées par l'e2e.
- **Evals** :
  - graders durcis : niveau d'architecture sur une ligne imposée, comportement vérifié par mutants, test écrit avant le code d'après le transcript, `hx.mjs` restauré et `config.json` figé avant notation ;
  - `setup` n'est plus pré-résolu ;
  - `--runs N` avec taux k/n, modèle épinglé (`EVAL_MODEL`), timeout par exécution ;
  - A/B `--without` qui retire aussi les lignes citant le composant ;
  - résultats en JSONL dans `evals/results/`.

### Corrigé
- `--component toString` (et tout nom hérité du prototype) accepté comme composant.
- `--file` sans valeur lançait toute la suite.
- `hx doctor` plantait sur un `path` non textuel.

## [0.1.0] — 2026-10-18

Phases 0 à 3 du plan : template Copier, CLI `hx`, 12 skills, 7 agents, 3 rules, 4 hooks, CI, evals. Annoncée à tort comme v1.0.
