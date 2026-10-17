# Harness

Template personnel de *harness engineering* pour **Claude Code**, autour d'[OpenSpec](https://github.com/Fission-AI/OpenSpec) : **skills**, **agents**, **rules**, **hooks** et **contrôles CI** à appliquer dans chaque projet, **quelle que soit la stack**.

## Utiliser le template

Prérequis : `git`, Node ≥ 20.19, [uv](https://docs.astral.sh/uv/) (pour lancer Copier).

```bash
uvx copier copy --trust gh:PatayEnCroute/Harness .   # 1. installer (projet nouveau ou existant)
npm i -g @fission-ai/openspec@1.14.3                  # 2. CLI requise par les commandes /opsx:*
# 3. dans Claude Code : /hx-setup                       → personnalisation à la stack
node .harness/hx.mjs doctor                           # 4. vérifier
uvx copier update --trust                             # plus tard : récupérer les améliorations
```

`--trust` autorise la tâche post-installation qui lance `openspec init`. Copier prend le dernier tag du repo, ou à défaut la branche par défaut.

## Ce qui est installé

| Générique (mis à jour par `copier update`) | Spécifique (rempli par `/hx-setup`, jamais écrasé) |
|---|---|
| `CLAUDE.md`, `.harness/hx.mjs`, `openspec/config.yaml`, `.claude/settings.json`, `.claude/skills/hx-*` | `.harness/config.json` (commandes par composant, profil d'architecture), `.harness/project.md` (carte du projet) |

## Développer le template

```bash
npm test                 # tests unitaires de hx
tests/e2e.sh node        # installation de bout en bout sur un projet de démo (node, python, dotnet, go, mixed)
tests/e2e-update.sh      # copier update conserve les personnalisations
```

| Document | Contenu |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Plan directeur : principes, architecture, workflow, catalogue, roadmap, décisions |
| [`docs/research/etat-de-l-art-2026-10.md`](docs/research/etat-de-l-art-2026-10.md) | État de l'art sourcé (octobre 2026) |

**Statut** : phase 0 livrée (socle). Prochaine étape : phase 1, la boucle de base (skills, agents, hooks, workflow CI du projet).
