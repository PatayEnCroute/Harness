# Harness

Template personnel de *harness engineering* pour **Claude Code**, autour d'[OpenSpec](https://github.com/Fission-AI/OpenSpec) : **skills**, **agents**, **rules**, **hooks** et **contrôles CI** à appliquer dans chaque projet, **quelle que soit la stack**.

## Utiliser le template

Prérequis : `git`, Node ≥ 20.19, [uv](https://docs.astral.sh/uv/) (pour lancer Copier).

```bash
uvx copier@9.19.1 copy --trust gh:PatayEnCroute/Harness .   # 1. installer (projet nouveau ou existant)
npm i -g @fission-ai/openspec@$(node -p "require('./.harness/versions.json').openspec")   # 2. CLI des /opsx:*
# 3. dans Claude Code : /hx-setup                       → personnalisation à la stack
node .harness/hx.mjs doctor                           # 4. vérifier
uvx copier@9.19.1 update --trust                     # plus tard : récupérer les améliorations
```

`--trust` autorise les tâches post-installation : `openspec init` à l'installation, puis `openspec update` et `hx migrate` (clés nouvelles ajoutées à `.harness/config.json`) à chaque mise à jour. Copier prend le dernier tag du repo ; `hx doctor` signale un projet en retard. Questions : nom du projet, workflow CI (`ci`) et sa branche par défaut (`default_branch`, `main`), relecteurs obligatoires (`codeowners`, vide par défaut : sinon un `.github/CODEOWNERS` couvre `.harness/`, `.claude/settings.json`, `.github/` et `openspec/specs/`, à combiner avec la protection de branche « Require review from Code Owners »). Copier 9.19.1 est la version testée en CI (et le minimum exigé par `copier.yml`).

**Projet existant** : commite d'abord (git est requis), puis lance l'installation **sans** `--defaults` et accepte le remplacement de `CLAUDE.md`, `.claude/settings.json` et `openspec/config.yaml` s'ils existent. `/hx-setup` récupère ensuite leur contenu utile depuis git.

## Le workflow installé

```
hx-triage ─┬─ S   : hx-tdd (ou hx-debug) → hx-verify → commit
           └─ M/L : [hx-clarify] → /opsx:propose → hx-implement → hx-verify → hx-review → /hx-ship → hx-learn
                    L : + hx-architect et hx-adr, design validé avant d'implémenter
```

`[hx-clarify]` : seulement si la demande est floue. `/hx-ship` fait de l'archive OpenSpec le dernier commit de la PR.

| | Contenu |
|---|---|
| **12 skills** | `hx-setup`, `hx-triage`, `hx-clarify`, `hx-tdd`, `hx-implement`, `hx-verify`, `hx-review`, `hx-ship`, `hx-adr`, `hx-debug`, `hx-learn`, `hx-discover` |
| **7 agents** | `hx-explorer`, `hx-implementer`, `hx-spec-reviewer`, `hx-code-reviewer`, `hx-security-reviewer`, `hx-architect`, `hx-verifier` |
| **3 rules** | `openspec`, `testing`, `architecture` (feature-first, proportionnée au besoin) |
| **4 hooks** | contexte de session ; confirmation avant d'écrire une spec principale ou un fichier qui décide de ce qui s'exécute (contrat, hooks, permissions, version d'OpenSpec) ; lint du fichier édité ; avant de rendre la main, d'après git : contrôles rapides des composants modifiés et signalement des chemins protégés modifiés, quel que soit l'outil |
| **Permissions** | `node .harness/hx.mjs` et `openspec` sans confirmation ; Edit refusé sur `hx.mjs`, `hooks.mjs` et `versions.json` (gérés par Copier), toute autre écriture de ces fichiers demande confirmation |
| **`hx check`** | contrat · openspec · archives · pistes · trace `@scenario` · lint · typecheck · arch · test (jamais vert sans test), mêmes commandes en local et en CI |

| Générique (mis à jour par `copier update`) | Spécifique (rempli par `/hx-setup`, jamais écrasé) |
|---|---|
| `CLAUDE.md`, `.claude/`, `.harness/hx.mjs`, `.harness/hooks.mjs`, `openspec/config.yaml`, `.github/workflows/hx-check.yml` | `.harness/config.json`, `.harness/project.md`, `.harness/ci/setup/action.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.claude/rules/stack-*.md` |

Les actions GitHub sont épinglées par SHA de commit et tenues à jour par Dependabot. Dans ce repo, les SHA de `hx-check.yml.jinja` suivent ceux de `ci.yml` (un test le vérifie).

## Mettre à jour, résoudre un conflit, désinstaller

- **Mettre à jour** : `uvx copier@9.19.1 update --trust` sur un arbre git propre, puis `node .harness/hx.mjs doctor`. Les fichiers spécifiques ne sont jamais réécrits ; `hx migrate` ajoute à `config.json` les clés nouvelles.
- **Conflit** : quand le template et le projet ont changé la même zone d'un fichier générique, Copier y laisse des marqueurs `<<<<<<<` / `>>>>>>>` (ou un fichier `.rej`). `hx doctor` liste les marqueurs et les `.rej` de `.claude/` et `.harness/`, et les marqueurs de `CLAUDE.md`, `openspec/config.yaml` et `hx-check.yml` ; `git status` montre les autres `.rej`. Garde la version du template sauf personnalisation voulue (un fichier générique s'améliore dans Harness, pas dans le projet), supprime les marqueurs et les `.rej`, relance `hx doctor`, puis commite.
- **Désinstaller** : supprime `.harness/`, `.copier-answers.yml`, `.claude/skills/hx-*`, `.claude/agents/hx-*`, les rules `openspec`, `testing` et `architecture` de `.claude/rules/`, `.github/workflows/hx-check.yml` (et `.github/CODEOWNERS`, `.github/dependabot.yml` s'ils viennent du template). Retire de `.claude/settings.json` les hooks qui appellent `.harness/hooks.mjs`, les permissions `hx.mjs` et `openspec` et la variable `OPENSPEC_TELEMETRY`, et de `CLAUDE.md` les sections du harness. `openspec/` reste utilisable sans le harness : garde-le si les specs servent encore.

## Développer le template

```bash
npm test                # unitaires hx, hooks et correcteurs des evals, lint du template (hermétique ; CI : Linux, macOS, Windows)
npm run test:contract   # contrat OpenSpec, sur la version épinglée (réseau)
npm run e2e             # 5 stacks, cycle OpenSpec complet, copier update
npm run evals           # agents headless (claude -p, ta session Claude Code, sans clé d'API) notés de façon déterministe ; en local seulement
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
git tag v0.3.0 && git push origin v0.3.0
```

**Statut** : v0.3.0, phases 0 à 4 livrées (P4 : fiabilisation), **pas encore éprouvées sur un vrai projet**. La v1.0 attend le pilote : 3 changes M de bout en bout et une traçabilité ≥ 80 %. Historique : [`CHANGELOG.md`](CHANGELOG.md).
