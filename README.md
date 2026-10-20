# Harness

Template personnel de *harness engineering* pour **Claude Code**, autour d'[OpenSpec](https://github.com/Fission-AI/OpenSpec) : **skills**, **agents**, **rules**, **hooks** et **contrôles CI** à appliquer dans chaque projet, **quelle que soit la stack**.

## Utiliser le template

> **Agent IA** : pour installer le harness à la demande d'un utilisateur, suis [`INSTALL.md`](INSTALL.md). Côté utilisateur, il suffit de dire à Claude Code : « Installe le harness github.com/PatayEnCroute/Harness en suivant son INSTALL.md ».

Prérequis : `git` et Node ≥ 20.19. Dans le dossier du projet (vide, ou dépôt git sans changement en cours) :

```bash
npx github:PatayEnCroute/Harness
```

| Le lanceur | Pourquoi |
|---|---|
| fait `git init` dans un dossier vide ; refuse un arbre git sale | `/hx-setup` retrouve dans git les fichiers que l'installation remplace |
| installe [uv](https://docs.astral.sh/uv/) s'il manque, après accord | uv lance Copier, le moteur du template |
| lance `uvx copier@9.19.1 copy --trust` | questions : nom du projet, workflow CI (`ci`), branche par défaut (`default_branch`), relecteurs obligatoires (`codeowners`) |
| ouvre Claude Code sur `/hx-setup` | personnalisation à la stack, vérifiée à la fin par `hx doctor` |

La CLI OpenSpec (commandes `/opsx:*`) est installée au premier démarrage de session si elle est absente. Options : `--vcs-ref vX.Y.Z` (version précise du template), `--defaults` (sans questions), `--no-claude`, `--help`.

**Projet existant** : accepte le remplacement de `CLAUDE.md`, `.claude/settings.json` et `openspec/config.yaml` s'ils existent. `/hx-setup` récupère ensuite leur contenu utile depuis git.

**Sans le lanceur** : `uvx copier@9.19.1 copy --trust gh:PatayEnCroute/Harness .`, puis `/hx-setup` dans Claude Code.

**Plus tard** : `uvx copier@9.19.1 update --trust` récupère les améliorations. Copier prend le dernier tag du repo ; `hx doctor` signale un projet en retard.

`--trust` autorise les tâches post-installation : `openspec init` à l'installation, puis `openspec update` et `hx migrate` (clés nouvelles ajoutées à `.harness/config.json`) à chaque mise à jour. Avec `codeowners`, un `.github/CODEOWNERS` couvre `.harness/`, `.claude/settings.json`, `.github/` et `openspec/specs/`, à combiner avec la protection de branche « Require review from Code Owners ». Copier 9.19.1 est la version testée en CI (et le minimum exigé par `copier.yml`).

## Le workflow installé

```
hx-triage ─┬─ S   : hx-tdd (ou hx-debug) → hx-verify → commit
           └─ M/L : CADRAGE (avec toi)         [hx-clarify] → /opsx:propose → porte : [contre-relecture], validation, x-validated, hx worktree
                    RUN (seul, son worktree)   hx-implement → hx-verify → hx-review → rapport de fin de run
                    LIVRAISON (toi)            /hx-ship → hx-learn
                    L : + hx-architect et hx-adr, validés à la porte
```

`[hx-clarify]` : seulement si la demande est floue. `[contre-relecture]` : en M avec `design.md` et en L, un `hx-architect` neuf conteste le cadrage avant la porte (garder, simplifier, retirer, changer). **Un seul arrêt prévu**, la porte de cadrage : tu y vérifies que la spec dit ce que tu as demandé, sans plus, et tu y vois les décisions retirées. Ensuite le run va jusqu'au rapport sans te solliciter, dans son propre worktree (`hx worktree <change>`) : pendant ce temps, tu cadres le change suivant dans le dossier principal. Le run ne s'arrête que sur un vrai blocage (3 échecs sur une tâche, spec fausse, piste qui monte, outillage cassé). Lance-le en mode `auto` (`--permission-mode auto`) : la commande affichée par `hx worktree` le fait. Ce mode ne demande pas de confirmation à chaque commande. Les chemins protégés et `git push` restent confirmés. Les permissions accordées dans le dossier principal (`.claude/settings.local.json`) sont reprises dans le worktree. Le rapport se termine par une question sur les mineurs : tranche-la avant `/hx-ship`, qui fait de l'archive OpenSpec le dernier commit de la PR.

| | Contenu |
|---|---|
| **12 skills** | `hx-setup`, `hx-triage`, `hx-clarify`, `hx-tdd`, `hx-implement`, `hx-verify`, `hx-review`, `hx-ship`, `hx-adr`, `hx-debug`, `hx-learn`, `hx-discover` |
| **7 agents** | `hx-explorer`, `hx-implementer`, `hx-spec-reviewer`, `hx-code-reviewer`, `hx-security-reviewer`, `hx-architect`, `hx-verifier` |
| **3 rules** | `openspec`, `testing`, `architecture` (feature-first, proportionnée au besoin) |
| **4 hooks** | contexte de session ; confirmation avant d'écrire une spec principale ou un fichier qui décide de ce qui s'exécute (contrat, hooks, permissions, version d'OpenSpec) ; lint du fichier édité ; avant de rendre la main, d'après git : contrôles rapides des composants modifiés et signalement des chemins protégés modifiés, quel que soit l'outil |
| **Permissions** | `node .harness/hx.mjs`, `openspec`, git local (lecture, `add`, `commit`, `pull`, `branch -d`, `worktree`, `bisect`), `gh pr create/checks/view` et lectures shell (`ls`, `cat`, `head`, `tail`, `wc`) sans confirmation. Confirmés exprès (`ask`) : `git push`, `git worktree remove --force`, `git bisect run`, `gh issue create`. Un test vérifie que chaque commande citée par un skill est couverte ; Edit refusé sur `hx.mjs`, `hooks.mjs` et `versions.json` (gérés par Copier), toute autre écriture de ces fichiers demande confirmation |
| **`hx check`** | contrat · openspec · archives · pistes · trace `@scenario` · lint · typecheck · arch · test (jamais vert sans test), mêmes commandes en local et en CI |

| Générique (mis à jour par `copier update`) | Spécifique (rempli par `/hx-setup`, jamais écrasé) |
|---|---|
| `CLAUDE.md`, `.claude/`, `.harness/hx.mjs`, `.harness/hooks.mjs`, `openspec/config.yaml`, `.github/workflows/hx-check.yml` | `.harness/config.json`, `.harness/project.md`, `.harness/ci/setup/action.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.claude/rules/stack-*.md` |

Les actions GitHub sont épinglées par SHA de commit et tenues à jour par Dependabot. Dans ce repo, les SHA de `hx-check.yml.jinja` suivent ceux de `ci.yml` (un test le vérifie).

## Mettre à jour, résoudre un conflit, désinstaller

- **Mettre à jour** : `uvx copier@9.19.1 update --trust` sur un arbre git propre, puis `node .harness/hx.mjs doctor`. Les fichiers spécifiques ne sont jamais réécrits ; `hx migrate` ajoute à `config.json` les clés nouvelles.
- **Conflit** : quand le template et le projet ont changé la même zone d'un fichier générique, Copier y laisse des marqueurs `<<<<<<<` / `>>>>>>>` ou un fichier `.rej`, que `hx doctor` liste. Garde la version du template sauf personnalisation voulue (un fichier générique s'améliore dans Harness, pas dans le projet), supprime les marqueurs et les `.rej`, relance `hx doctor`, puis commite.
- **Désinstaller** : supprime `.harness/`, `.copier-answers.yml`, `.claude/skills/hx-*`, `.claude/agents/hx-*`, les rules `openspec`, `testing` et `architecture` de `.claude/rules/`, `.github/workflows/hx-check.yml` (et `.github/CODEOWNERS`, `.github/dependabot.yml` s'ils viennent du template). Retire de `.claude/settings.json` les hooks qui appellent `.harness/hooks.mjs`, les permissions `hx.mjs`, `openspec` et `git` du template et la variable `OPENSPEC_TELEMETRY`, et de `CLAUDE.md` les sections du harness. `openspec/` reste utilisable sans le harness : garde-le si les specs servent encore.

## Développer le template

```bash
npm test                # unitaires hx, hooks et correcteurs des evals, lint du template (hermétique ; CI : Linux, macOS, Windows)
npm run test:contract   # contrat OpenSpec, sur la version épinglée (réseau)
npm run e2e             # 5 stacks, cycle OpenSpec complet, copier update, lanceur npx
npm run evals           # agents headless (claude -p, ta session Claude Code, sans clé d'API) notés de façon déterministe ; en local seulement
```

| Document | Contenu |
|---|---|
| [Page de présentation](https://patayencroute.github.io/Harness/) ([`docs/index.html`](docs/index.html)) | Le harness en schémas : cycle de vie, workflow, pièces, contrôles |
| [`docs/PLAN.md`](docs/PLAN.md) | Plan directeur : principes, architecture, workflow, catalogue, roadmap, décisions |
| [`docs/elagage.md`](docs/elagage.md) | Hypothèse encodée par chaque composant, mesure, signal de retrait |
| [`docs/adr/`](docs/adr/) | Décisions du template (Copier, Claude Code seul, pas de plugin utilisateur, OpenSpec et ses critères de sortie) |
| [`evals/README.md`](evals/README.md) | Evals comportementales et A/B |
| [`docs/research/etat-de-l-art-2026-10.md`](docs/research/etat-de-l-art-2026-10.md) | État de l'art sourcé (octobre 2026) |

## Publier une version

Les projets suivent les **tags** du template (`copier update` prend le dernier). Sur `main`, après fusion :

```bash
# 1. CHANGELOG.md : la section « Non publié » devient la version
git tag vX.Y.Z && git push origin vX.Y.Z
```

**Statut** : phases 0 à 6 livrées (P6 : runs sans interruption après la porte de cadrage), **éprouvées sur un vrai projet**. Version courante : le [dernier tag](https://github.com/PatayEnCroute/Harness/tags). Historique : [`CHANGELOG.md`](CHANGELOG.md).
