# État de l'art — octobre 2026

> Synthèse de la recherche qui fonde [`../PLAN.md`](../PLAN.md). Les éléments marqués ⚠️ n'ont pas pu être vérifiés sur une source primaire.

## 1. OpenSpec (Fission-AI)

| Sujet | Constat | Source |
|---|---|---|
| Version | `@fission-ai/openspec@1.14.3` (17/10/2026), environ une release par semaine. La 1.0 « OPSX » date du 26/01/2026. Node ≥ 20.19, licence MIT. | [npm](https://registry.npmjs.org/@fission-ai/openspec), [CHANGELOG](https://github.com/Fission-AI/OpenSpec/blob/main/CHANGELOG.md) |
| Arborescence | `openspec/{specs,changes,changes/archive}` + `config.yaml`. `project.md` et `openspec/AGENTS.md` ont été supprimés en 1.0. | [migration-guide](https://github.com/Fission-AI/OpenSpec/blob/main/docs/migration-guide.md) |
| Format des specs | `### Requirement:` (SHALL/MUST), `#### Scenario:` avec WHEN/THEN, ≥ 1 scénario par exigence, > 500 caractères = warning. Deltas : ADDED, MODIFIED, REMOVED, RENAMED. | [concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) |
| Workflow | Profil core : `/opsx:propose`, `explore`, `apply`, `update`, `sync`, `archive`. Profil étendu : `new`, `continue`, `ff`, `verify`, `bulk-archive`, `onboard`. | [opsx](https://github.com/Fission-AI/OpenSpec/blob/main/docs/opsx.md) |
| Intégrations | Une cinquantaine d'outils. Génère des **Agent Skills** `openspec-*` (+ commandes selon `delivery`). Pas de bloc AGENTS.md, pas de MCP, pas de plugin Claude. | [supported-tools](https://github.com/Fission-AI/OpenSpec/blob/main/docs/supported-tools.md) |
| Extensibilité | `config.yaml` (`context` ≤ 50 Ko, `rules.<artefact>`, `operations.*.guidance`), schémas custom `openspec/schemas/`, clés `x-*` dans `.openspec.yaml`, contrat JSON documenté. **Pas de hooks** : « enforce the gate with your own CI ». | [customization](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md), [agent-contract](https://github.com/Fission-AI/OpenSpec/blob/main/docs/agent-contract.md) |
| Limites | Merge d'archive fragile (#2033), chevauchement de changes invisible (#1669), pas de `depends_on` (#1915), monorepo (#1942), multi-repo en bêta (« stores »), pas de spec dérivée du code existant (#724), pas de vérification code ↔ spec (#880). | issues GitHub |

## 2. Standards agnostiques

| Brique | État | Source |
|---|---|---|
| **AGENTS.md** | Projet de l'Agentic AI Foundation (Linux Foundation) depuis le 09/12/2025. Lu par Codex, Copilot, Cursor, VS Code, Gemini, OpenCode, Amp, Devin, Kiro… Claude Code le lit nativement seulement si CLAUDE.md est absent ⚠️ → passer par `CLAUDE.md` contenant `@AGENTS.md`. | [agents.md](https://agents.md/), [LF](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) |
| **Agent Skills** | Spec `SKILL.md` : `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` (expérimental). `.agents/skills/` est lu par la majorité des outils. **Claude Code ne lit que `.claude/skills/`**. | [agentskills.io](https://agentskills.io/specification) |
| **Agent Plugins 1.0** | Manifeste portable (`plugin.json`, `skills/`, `mcp.json`) adopté par VS Code, Copilot CLI, Cursor, Codex et Kiro. Anthropic ne fait pas partie de l'initiative ; le format `.claude-plugin/` reste lu par plusieurs outils. | [agent-plugins.org](https://agent-plugins.org/) |
| **Subagents** | Pas de standard. Le format `.claude/agents/*.md` est lu aussi par VS Code et Cursor. Codex utilise du TOML ; Copilot `.agent.md` ; OpenCode, Gemini et Kiro ont chacun leur format. | docs des éditeurs |
| **Rules ciblées** | Pas de standard : `paths:` (Claude), `applyTo` (Copilot), `globs` en `.mdc` (Cursor), `fileMatch` (Kiro). | docs des éditeurs |
| **Hooks** | Convergence de fait vers les noms d'événements Claude (`PreToolUse`, `Stop`…) et le code de sortie 2 pour bloquer. Copilot CLI, Cursor et Codex lisent partiellement le format Claude. | docs des éditeurs |
| **MCP** | Spec 2026-07-28 : sans état, extensions formelles, gouvernance AAIF. | [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |
| Outils de sync | **rulesync** (~63 cibles, v37, très actif), **APM** (Microsoft, gestionnaire de paquets + lockfile + politique, v0.33), **skills CLI** (skills uniquement, ~70 agents), **ruler** (activité ralentie). | [rulesync](https://github.com/dyoshikawa/rulesync), [apm](https://github.com/microsoft/apm), [skills](https://github.com/vercel-labs/skills) |

## 3. Harness engineering

| Idée | Source |
|---|---|
| « Engineer the harness » : chaque erreur de l'agent → une ligne AGENTS.md ou un script | [Hashimoto](https://mitchellh.com/writing/my-ai-adoption-journey) |
| AGENTS.md = **carte**, pas manuel ; le repo est le système de référence ; invariants imposés par linters et tests structurels ; agents de « garbage collection » | [OpenAI](https://openai.com/index/harness-engineering/) (lu via miroir ⚠️) |
| Guides (feedforward) vs capteurs (feedback) ; contrôles **déterministes** vs **inférentiels** ; boucle de pilotage | [Böckeler / Fowler](https://martinfowler.com/articles/harness-engineering.html) |
| Évaluateur séparé du générateur (« les agents louent leur propre travail ») ; contrat de « done » avant de coder ; élaguer les composants quand les modèles progressent | [Anthropic, mars 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps) |
| Fichier de progression + liste de features initialement en échec ; une feature par session | [Anthropic, nov. 2025](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) |
| Les fichiers de contexte améliorent peu la réussite et coûtent +20 % en inférence ; utiles seulement pour le non-standard | [ETH, arXiv 2602.11988](https://arxiv.org/abs/2602.11988) |

## 4. Packs existants : rôles et phases récurrents

| Pack | Apport clé |
|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | Développement piloté par sous-agents (un implémenteur frais par tâche + review de conformité puis de qualité), TDD strict, vérification avant achèvement, skills formulés comme des « lois » |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | constitution → specify → clarify → plan → tasks → **analyze** → implement → **converge** (contrôle de dérive) ; presets et extensions |
| [Kiro](https://kiro.dev/docs/specs/) | Exigences EARS, « Quick Spec » sans gate, steering par `fileMatch`, tests de propriétés dérivés des exigences |
| [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) | Personas (Analyst, PM, Architect, Dev) ; review « adversariale » qui force des constats |
| [Plugins Anthropic](https://github.com/anthropics/claude-code/tree/main/plugins) | `feature-dev` (explorer, architect, reviewer) ; `code-review` = reviewers parallèles + **validateur** de faux positifs |
| [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin) | Phase **compound** : les leçons vont dans `docs/solutions/`, relues par les plans suivants |

**Ossature commune** : Clarifier → Spécifier → Planifier → Tâches → Implémenter (TDD) → Vérifier → Relire → Livrer → Apprendre.

## 5. Critiques à intégrer

| Critique | Source | Réponse dans le plan |
|---|---|---|
| Un petit bug transformé en 4 user stories et 16 critères d'acceptation | [Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) | Pistes S/M/L |
| « The Waterfall Strikes Back » : 1 300 lignes de spec pour afficher une date | [Marmelab](https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html) | Rules de concision, chemin S |
| Goulot de review : +98 % de PR mergées, +91 % de temps de review ⚠️ | [secondaire](https://www.augmentcode.com/guides/ai-productivity-paradox-engineering-delivery) | Petites PR, reviewers IA filtrés |
| Gains de productivité non démontrés (METR 2026 : −4 %, IC −15 % à +9 %) | [METR](https://evals.alignment.org/blog/2026-02-24-uplift-update/) | Baseline et mesure dès la phase 0 |
| 13 à 26 % des skills publics vulnérables | [Snyk](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub), [arXiv 2601.10338](https://arxiv.org/abs/2601.10338) | Marketplace interne, scan |
