# Installer le harness : instructions pour un agent

Tu es un agent (Claude Code en local ou en session cloud) et l'utilisateur t'a demandé d'installer le harness dans son projet. Suis ces étapes dans l'ordre. **Rien ne s'installe ni ne se commite sans l'accord de l'utilisateur.**

## 1. Vérifier

| Contrôle | Commande | Si ça échoue |
|---|---|---|
| git | `git --version` | Arrête-toi : git est requis. |
| Node ≥ 20.19 | `node --version` | Arrête-toi : Node ≥ 20.19 est requis. |
| uv | `uvx --version` | Demande l'accord, puis installe uv : `curl -LsSf https://astral.sh/uv/install.sh \| sh` (Windows : `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"`). |
| Pas déjà installé | `.copier-answers.yml` absent | Propose une mise à jour à la place : `uvx copier@9.19.1 update --trust --defaults`. |
| Arbre propre | `git status --porcelain` vide | Montre les fichiers à l'utilisateur et demande s'il faut les commiter. Jamais de `stash`, `reset` ni `checkout` sur son travail. |

Dossier vide : le lanceur fait `git init` lui-même. Session cloud : si le réseau refuse `github.com`, `registry.npmjs.org` ou `astral.sh`, dis-le à l'utilisateur (politique réseau de l'environnement) au lieu de contourner.

## 2. Poser les questions

Un seul message, chaque question avec sa réponse par défaut :

| Clé | Question | Défaut |
|---|---|---|
| `project_name` | Nom du projet | nom du dossier |
| `ci` | Ajouter le workflow GitHub Actions `hx-check` ? | `true` |
| `default_branch` | Branche principale (seulement si `ci`) | branche par défaut du dépôt, sinon `main` |
| `codeowners` | Relecteurs obligatoires du harness et des specs (`@utilisateur` ou `@org/équipe`) | vide : pas de CODEOWNERS |

**Projet existant** : si `CLAUDE.md`, `.claude/settings.json` ou `openspec/config.yaml` existent, préviens que l'installation les remplace et que `/hx-setup` récupérera leur contenu utile depuis git. Avec son accord, ajoute `--overwrite` à la commande ci-dessous.

## 3. Installer

Sans terminal interactif, `--defaults` est obligatoire et les réponses passent par `--data` :

```bash
npx --yes github:PatayEnCroute/Harness --defaults --no-claude \
  --data project_name=<nom> --data ci=true --data default_branch=main --data codeowners=
```

`--data default_branch=…` seulement si `ci=true`. Le lanceur installe la dernière version taguée du template ; `--vcs-ref vX.Y.Z` en fixe une.

## 4. Après

1. Montre à l'utilisateur ce que `git status` liste (fichiers créés ou remplacés). Ne commite qu'avec son accord.
2. Dis-lui de **redémarrer la session Claude Code** dans ce dossier : `CLAUDE.md`, les hooks et les skills du harness ne se chargent qu'au démarrage. Le hook de démarrage installe aussi la CLI OpenSpec si elle manque.
3. Dis-lui ensuite de taper **`/hx-setup`** : la personnalisation à la stack lui est réservée (tu ne peux pas lancer ce skill toi-même). Elle finit par `node .harness/hx.mjs doctor`.

## À ne pas faire

- Modifier les fichiers installés pour « finir » l'installation : c'est le rôle de `/hx-setup`.
- Appeler Copier sans `--trust` : `openspec init` ne serait pas lancé.
- Installer uv, commiter ou écraser des fichiers sans accord explicite.
