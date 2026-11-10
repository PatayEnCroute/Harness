# Parité des harness

Ce que le template apporte sous Claude Code, et ce qu'en obtient chaque autre harness.
Fichier généré par `node scripts/parity.mjs --write` ; la CI (job `parity`) refuse un tableau périmé.

| Niveau | Sens |
|---|---|
| 🟢 natif | même mécanisme que Claude Code |
| 🟢 équivalent | autre mécanisme, même effet (vérifié par `tests/parity.test.mjs`) |
| 🟡 dégradé | effet partiel : la raison est donnée |
| 🔴 absent | le harness n'offre pas de point d'accroche |

Score : natif et équivalent comptent 1, dégradé 0,5, absent 0. Plancher : 66 %.

| Capacité | Claude Code | Codex | OpenCode | Antigravity | DeepSeek Harness |
| --- | --- | --- | --- | --- | --- |
| **Consignes du projet** | 🟢 CLAUDE.md | 🟢 équivalent · AGENTS.md généré | 🟢 équivalent · AGENTS.md généré | 🟢 équivalent · AGENTS.md généré | 🟢 équivalent · AGENTS.md généré, CLAUDE.md écarté par le patch |
| **Carte du projet** | 🟢 import `@.harness/project.md` | 🟢 équivalent · recopiée dans AGENTS.md | 🟢 équivalent · recopiée dans AGENTS.md | 🟢 équivalent · recopiée dans AGENTS.md | 🟢 équivalent · recopiée dans AGENTS.md |
| **Skills** | 🟢 `.claude/skills/` | 🟢 natif · `.agents/skills/` | 🟢 natif · lit `.claude/skills/` | 🟢 natif · `.agents/skills/` | 🟢 natif · `.agents/skills/` |
| **Skills lancés seulement à la demande** | 🟢 `disable-model-invocation` | 🟢 équivalent · `agents/openai.yaml` : `allow_implicit_invocation: false` | 🟢 natif · champ reconnu (V2) ; ignoré en V1 | 🟡 dégradé · champ ignoré : la description dit « à la demande » | 🟢 natif · champ reconnu |
| **Sous-agents** | 🟢 `.claude/agents/*.md` | 🟢 équivalent · `.codex/agents/*.toml` | 🟢 équivalent · `.opencode/agents/*.md` | 🟢 équivalent · `.agents/agents/*.md` | 🟡 dégradé · pas de sous-agent en fichier : outil `subagent` avec la consigne de `.claude/agents/` |
| **Sous-agents en lecture seule** | 🟢 liste `tools` sans Edit ni Write | 🟡 dégradé · consigne seulement : pas de restriction par agent | 🟢 équivalent · `permission.edit: deny` | 🟢 équivalent · liste `tools` sans outil d'écriture | 🟡 dégradé · consigne seulement |
| **Modèle léger pour l'exploration** | 🟢 `model: haiku` | 🟢 équivalent · `adapters.models` de `.harness/config.json` (vide : modèle de la session) | 🟢 équivalent · `adapters.models` de `.harness/config.json` (vide : modèle de la session) | 🟢 équivalent · `model: flash`, réglable par `adapters.models` | 🔴 absent · pas de sous-agent en fichier : modèle de la session |
| **Rules ciblées par chemin** | 🟢 `.claude/rules/*.md` (`paths:`) | 🟢 équivalent · hook `PreToolUse` : règle injectée à la première édition d'un fichier concerné | 🟢 équivalent · plugin : règle jointe au résultat de la première édition concernée | 🟢 natif · `.agents/rules/*.md` (`trigger: glob`) | 🟢 équivalent · pont de hooks : règle injectée à la première édition concernée |
| **Démarrage : prochaine action de chaque change** | 🟢 hook `SessionStart` | 🟢 natif · `.codex/hooks.json` | 🟢 équivalent · plugin, événement `session.created` | 🟢 natif · `.agents/hooks.json` | 🟡 dégradé · pont expérimental ; le contexte peut arriver après la première requête |
| **« livre <change> » noté comme une décision** | 🟢 hook `UserPromptSubmit` | 🟢 natif · `.codex/hooks.json` | 🟢 équivalent · plugin, admission du prompt | 🟢 équivalent · hook `PreInvocation`, dédoublonné | 🟢 natif · pont de hooks |
| **Rappel sur un fichier protégé** | 🟢 hook `PreToolUse` | 🟢 natif · `.codex/hooks.json` | 🟢 équivalent · plugin : note jointe au résultat de l'outil | 🟡 dégradé · motif joint à la décision, sans garantie qu'il atteigne l'agent | 🟢 natif · pont de hooks |
| **`/hx-ship` refusé sans décision ni indice suffisant** | 🟢 hook `PreToolUse` sur l'outil Skill | 🟢 équivalent · pas d'outil Skill visible : la garde est dans `hx` (`hx ship-gate`, `hx openspec archive`) | 🟢 natif · plugin, outil `skill` | 🟢 équivalent · lecture de `SKILL.md` vue ; confirmation native demandée à l'utilisateur | 🟢 natif · pont de hooks, outil `skill` |
| **Lint du fichier édité** | 🟢 hook `PostToolUse` | 🟢 natif · `.codex/hooks.json` | 🟢 équivalent · plugin : retour joint au résultat de l'outil | 🟢 équivalent · retour gardé par `PostToolUse`, injecté par `PreInvocation` à l'appel suivant au modèle | 🟢 natif · pont de hooks |
| **Clic « livrer » noté comme une décision** | 🟢 hook `PostToolUse` sur AskUserQuestion | 🟡 dégradé · `request_user_input` selon le mode ; sinon message « livre <change> » | 🟢 équivalent · plugin, outil `question` | 🟢 équivalent · réponse invisible aux hooks : confirmation native au lancement de `/hx-ship` | 🟡 dégradé · réponse en texte libre : notée seulement si un seul choix y figure |
| **Contrôles rapides avant de rendre la main** | 🟢 hook `Stop` | 🟢 natif · `.codex/hooks.json` | 🟢 équivalent · plugin : nouveau tour si un contrôle échoue | 🟢 natif · `.agents/hooks.json` | 🟢 équivalent · pont de hooks, garde anti-boucle dans hooks.mjs |
| **Commandes autorisées sans confirmation** | 🟢 `permissions.allow` | 🟢 équivalent · `.codex/rules/harness.rules` (préfixes) | 🟢 équivalent · `.opencode/opencode.json` | 🟢 équivalent · hook `PreToolUse` : `auto_approve` sur les commandes simples | 🔴 absent · pas de règle par commande : préréglage de permissions |
| **Fichiers du harness non éditables** | 🟢 `permissions.deny` | 🟢 équivalent · hook `PreToolUse` sur `apply_patch` | 🟢 équivalent · `permission.edit` et plugin | 🟢 équivalent · hook `PreToolUse` | 🟢 équivalent · pont de hooks |
| **Variables d'environnement de session** | 🟢 `env` de settings.json | 🟢 équivalent · `.codex/config.toml` (`shell_environment_policy`) | 🟢 équivalent · plugin, environnement du shell | 🔴 absent · aucun réglage de projet | 🔴 absent · aucun réglage de projet |
| **Choix cliquables aux arrêts prévus** | 🟢 outil AskUserQuestion | 🟡 dégradé · `request_user_input` selon le mode, sinon texte | 🟢 natif · outil `question` | 🟢 natif · outil `ask_question` | 🟢 natif · outil `ask_user_question` |
| **Run dans un worktree sans changer de session** | 🟢 outil EnterWorktree | 🟡 dégradé · commandes lancées depuis le worktree | 🟡 dégradé · commandes lancées depuis le worktree | 🟡 dégradé · commandes lancées depuis le worktree | 🟡 dégradé · `create_worktree` expérimental, sinon commandes depuis le worktree |
| **Commandes OpenSpec** | 🟢 `/opsx:*` | 🟢 natif · `$openspec-*` | 🟢 natif · `/opsx-*` | 🟢 natif · `/opsx-*` | 🟢 natif · `/openspec-*` |
| **Score** | **100 %** | **90 %** | **98 %** | **88 %** | **74 %** |

| Harness | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Codex | 17 | 4 | 0 |
| OpenCode | 20 | 1 | 0 |
| Antigravity | 17 | 3 | 1 |
| DeepSeek Harness | 13 | 5 | 3 |
