# Harness

Template personnel de *harness engineering* pour **Claude Code**, autour d'[OpenSpec](https://github.com/Fission-AI/OpenSpec) : **skills**, **agents**, **rules**, **hooks** et **contrôles CI** à appliquer dans chaque projet, **quelle que soit la stack**.

## Utiliser le template

Prérequis : `git`, Node ≥ 20.19, [uv](https://docs.astral.sh/uv/) (pour lancer Copier).

```bash
uvx copier copy --trust gh:PatayEnCroute/Harness .   # 1. installer (projet nouveau ou existant)
npm i -g @fission-ai/openspec@$(node -p "require('./.harness/versions.json').openspec")   # 2. CLI des /opsx:*
# 3. dans Claude Code : /hx-setup                       → personnalisation à la stack
node .harness/hx.mjs doctor                           # 4. vérifier
uvx copier update --trust                             # plus tard : récupérer les améliorations
```

`--trust` autorise les tâches post-installation : `openspec init` à l'installation, puis `openspec update` et `hx migrate` (clés nouvelles ajoutées à `.harness/config.json`) à chaque mise à jour. Copier prend le dernier tag du repo ; `hx doctor` signale un projet en retard. Questions : nom du projet, workflow CI (`ci`) et sa branche par défaut (`default_branch`, `main`).

**Projet existant** : commite d'abord (git est requis), puis lance l'installation **sans** `--defaults` et accepte le remplacement de `CLAUDE.md`, `.claude/settings.json` et `openspec/config.yaml` s'ils existent. `/hx-setup` récupère ensuite leur contenu utile depuis git.

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
| **4 hooks** | contexte de session, confirmation avant d'écrire une spec principale ou un fichier qui décide de ce qui s'exécute (contrat, hooks, permissions), lint du fichier édité, contrôles rapides des composants édités avant de rendre la main |
| **`hx check`** | contrat · openspec · archives · pistes · trace `@scenario` · lint · typecheck · arch · test (jamais vert sans test), mêmes commandes en local et en CI |

| Générique (mis à jour par `copier update`) | Spécifique (rempli par `/hx-setup`, jamais écrasé) |
|---|---|
| `CLAUDE.md`, `.claude/`, `.harness/hx.mjs`, `.harness/hooks.mjs`, `openspec/config.yaml`, `.github/workflows/hx-check.yml` | `.harness/config.json`, `.harness/project.md`, `.harness/ci/setup/action.yml`, `.github/dependabot.yml`, `.claude/rules/stack-*.md` |

Les actions GitHub sont épinglées par SHA de commit et tenues à jour par Dependabot. Dans ce repo, les SHA de `hx-check.yml.jinja` suivent ceux de `ci.yml` (un test le vérifie).

## Développer le template

```bash
npm test                # unitaires hx et hooks, lint du template (hermétique ; CI : Linux, macOS, Windows)
npm run test:contract   # contrat OpenSpec, sur la version épinglée (réseau)
npm run e2e             # 5 stacks, cycle OpenSpec complet, copier update
npm run evals           # agents headless notés de façon déterministe (coût réel)
```

| Document | Contenu |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Plan directeur : principes, architecture, workflow, catalogue, roadmap, décisions |
| [`docs/elagage.md`](docs/elagage.md) | Hypothèse encodée par chaque composant, mesure, signal de retrait |
| [`docs/adr/`](docs/adr/) | Décisions du template (Copier, Claude Code seul, pas de plugin utilisateur, OpenSpec et ses critères de sortie) |
| [`evals/README.md`](evals/README.md) | Evals comportementales et A/B |
| [`docs/research/etat-de-l-art-2026-10.md`](docs/research/etat-de-l-art-2026-10.md) | État de l'art sourcé (octobre 2026) |

## Publier une version

Les projets suivent les **tags** du template (`copier update` prend le dernier). Sur `main`, après fusion :

```bash
# 1. CHANGELOG.md : la section « Non publié » devient la version
git tag v0.2.0 && git push origin v0.2.0
```

**Statut** : v0.2.0, phases 0 à 3 livrées, **pas encore éprouvées sur un vrai projet**. La v1.0 attend le pilote : 3 changes M de bout en bout et une traçabilité ≥ 80 %. Historique : [`CHANGELOG.md`](CHANGELOG.md).
