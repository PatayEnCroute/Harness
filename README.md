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

## Le workflow installé

```
hx-triage ─┬─ S : hx-tdd ─────────────────────────────────────────┐
           └─ M/L : hx-clarify → /opsx:propose → hx-implement ──┤
                     (L : hx-architect + hx-adr)                  ▼
                       hx-learn ◄── /hx-ship ◄── hx-review ◄── hx-verify
```

| | Contenu |
|---|---|
| **12 skills** | `hx-setup`, `hx-triage`, `hx-clarify`, `hx-tdd`, `hx-implement`, `hx-verify`, `hx-review`, `hx-ship`, `hx-adr`, `hx-debug`, `hx-learn`, `hx-discover` |
| **7 agents** | `hx-explorer`, `hx-implementer`, `hx-spec-reviewer`, `hx-code-reviewer`, `hx-security-reviewer`, `hx-architect`, `hx-verifier` |
| **3 rules** | `openspec`, `testing`, `architecture` (feature-first, proportionnée au besoin) |
| **4 hooks** | contexte de session, confirmation avant d'écrire une spec principale, lint du fichier édité, contrôles rapides avant de rendre la main |
| **`hx check`** | openspec · archives · pistes · trace `@scenario` · lint · typecheck · arch · test, identique en local et en CI |

| Générique (mis à jour par `copier update`) | Spécifique (rempli par `/hx-setup`, jamais écrasé) |
|---|---|
| `CLAUDE.md`, `.claude/`, `.harness/hx.mjs`, `.harness/hooks.mjs`, `openspec/config.yaml`, `.github/workflows/hx-check.yml` | `.harness/config.json`, `.harness/project.md`, `.harness/ci/setup/action.yml`, `.claude/rules/stack-*.md` |

## Développer le template

```bash
npm test                # unitaires hx et hooks, lint du template, contrat OpenSpec
npm run e2e             # 5 stacks, cycle OpenSpec complet, copier update
npm run evals           # agents headless notés de façon déterministe (coût réel)
```

| Document | Contenu |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Plan directeur : principes, architecture, workflow, catalogue, roadmap, décisions |
| [`docs/elagage.md`](docs/elagage.md) | Hypothèse encodée par chaque composant, mesure, signal de retrait |
| [`docs/adr/`](docs/adr/) | Décisions du template (Copier, Claude Code seul, pas de plugin utilisateur) |
| [`evals/README.md`](evals/README.md) | Evals comportementales et A/B |
| [`docs/research/etat-de-l-art-2026-10.md`](docs/research/etat-de-l-art-2026-10.md) | État de l'art sourcé (octobre 2026) |

**Statut** : v1.0, phases 0 à 3 livrées. À confirmer sur un vrai projet : 3 changes M de bout en bout et la traçabilité du projet pilote.
