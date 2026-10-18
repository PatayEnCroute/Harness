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

### Corrigé
- `--component toString` (et tout nom hérité du prototype) accepté comme composant.
- `--file` sans valeur lançait toute la suite.
- `hx doctor` plantait sur un `path` non textuel.

## [0.1.0] — 2026-10-18

Phases 0 à 3 du plan : template Copier, CLI `hx`, 12 skills, 7 agents, 3 rules, 4 hooks, CI, evals. Annoncée à tort comme v1.0.
