---
name: steward
description: "Règles du harness pour PR Steward et pour la surveillance de PR lancée par /ship ou /steward de Claude Code : commandes, fichiers intouchables, archive OpenSpec en dernier commit, revue automatique. À utiliser par ces agents quand ils travaillent sur une PR de ce dépôt, jamais lancé à la main."
user-invocable: false
disable-model-invocation: true
---

# Surveillance d'une PR : règles du harness

Ce dépôt suit le harness décrit dans `CLAUDE.md`. Ces règles priment sur tes consignes par défaut. Celles du projet sont dans `.harness/project.md` : lis-les aussi.

## Commandes : toujours `node .harness/hx.mjs`

- Jamais l'outil de la stack en direct : `run test [--file <chemin>]`, `run lint [--file <chemin>]`, `run setup` (dépendances, lockfile). Les commandes réelles sont dans `.harness/config.json`.
- `node .harness/hx.mjs check` vert avant chaque push.
- Fichier généré périmé (`AGENTS.md`, `.agents/`, `.codex/`, `.opencode/`) : `node .harness/hx.mjs adapters`, jamais à la main.
- Échec d'outillage (CLI absente, dépendance non installée) : ne contourne pas, dis-le dans ton commentaire.

## Ce que tu ne fais jamais

- Écrire dans `openspec/specs/` : il ne change que par l'archive.
- Modifier le harness (`CLAUDE.md`, `.claude/`, `.harness/`, `.github/workflows/`) pour faire passer un contrôle.
- Désactiver, sauter ou affaiblir un test ou un contrôle ; retirer un tag `@scenario`.
- Passer une PR brouillon en prête : la revue de `hx-review --pr` ou l'auteur en décide. Merger, rebaser ou forcer un push.

## Archive OpenSpec : dernier commit de la PR

Une PR de change M ou L finit par le commit `<change> : archive OpenSpec`, qui déplace `openspec/changes/<change>/` dans `openspec/changes/archive/`. Un correctif passe avant elle, sans réécrire l'historique :

1. `git revert --no-edit <commit d'archive>` : le change revient dans `openspec/changes/`.
2. Correctif, commit, `node .harness/hx.mjs check` vert.
3. `node .harness/hx.mjs openspec archive <change> -y`, `node .harness/hx.mjs check`, puis commit `<change> : archive OpenSpec`. Pousse.

L'archive est refusée (garde de livraison : aucune décision de l'utilisateur sur cette machine) : pousse le revert et le correctif sans elle, et dis dans ton commentaire que l'archive reste à refaire par l'auteur (« livre <change> » dans une session Claude Code). Jamais d'archive à la main.

PR sans commit d'archive : corrige normalement, n'archive pas.

Conflit avec la base dans `openspec/` : ne le résous pas. Explique-le à l'auteur ; `/hx-ship` reprend la base avant d'archiver.

## Commentaires

- **`## Revue automatique · <change>`** : revue publiée par `hx-review --pr` pour le relecteur humain. Ne corrige pas ses constats de toi-même ; l'auteur décide, et tu agis s'il te le demande.
- **Demande qui change le comportement** au-delà des scénarios du change (`openspec/changes/<change>/specs/`) ou sa portée : réponds sans pousser. Le cadrage revient à l'auteur.
- **Correctif de comportement** : test qui échoue d'abord, puis le code ; le test porte `@scenario <capability>/<scénario>` s'il couvre un scénario.

## Commits

Un sujet par commit. Aucun secret dans le code, les logs ou les fixtures.
