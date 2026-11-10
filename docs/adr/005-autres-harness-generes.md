# ADR-005 : Autres harness générés depuis la source Claude Code

- Statut : Accepté
- Date : 2026-11-10
- Remplace : [ADR-002](002-claude-code-seul-standards-gratuits.md) (sa révision est déclenchée : un deuxième outil IA est utilisé)

## Besoin
Utiliser le même harness (consignes, skills, sous-agents, rules, hooks, permissions) sous Codex, OpenCode, Antigravity et DeepSeek Harness, sans maintenir cinq copies ni laisser un harness prendre du retard sans que personne le voie.

## Contexte
- Les briques ont convergé (`SKILL.md`, AGENTS.md, hooks, sous-agents en fichiers), pas leurs formats : chemins, noms d'outils et protocole des hooks diffèrent (documentations officielles relevées le 10/11/2026).
- Aucun de ces harness ne lit `.claude/` en entier. OpenCode lit `.claude/skills/` ; DeepSeek Harness lit `CLAUDE.md`.
- Les hooks portent la logique la plus fine du harness (garde de `/hx-ship`, contrôles avant de rendre la main) : la réécrire par harness la ferait diverger.

## Options
| Option | Coût | Rend plus facile | Rend plus difficile | Réversible ? |
|---|---|---|---|---|
| Ne rien faire : Claude Code seul | nul | la maintenance | tout usage d'un autre harness | oui |
| Copies écrites à la main par harness | élevé : chaque changement fait cinq fois | un réglage fin par harness | la cohérence ; rien ne détecte un oubli | oui |
| Outil tiers de synchronisation (rulesync, APM) | moyen : dépendance, hooks et sous-agents hors périmètre | les instructions et les skills | les hooks, qui resteraient à écrire | oui |
| **Générateur maison, source unique `.claude/`, hooks traduits** | moyen : un fichier (`adapters.mjs`), un test de parité | ajouter un harness ; garder un seul comportement | suivre quatre formats qui bougent | oui : supprimer les fichiers générés |

## Décision
`.claude/`, `CLAUDE.md` et `.harness/project.md` restent la seule source. `hx adapters` génère les fichiers des harness choisis à l'installation (question `tools`) ; ils ne s'éditent jamais.

| Garde-fou | Comment |
|---|---|
| Un seul comportement de hooks | Tous les harness appellent `.harness/hooks.mjs` ; `adapters.mjs` traduit l'entrée et la sortie de chacun |
| Pas de dérive dans un projet | `hx check` et `hx doctor` échouent sur un fichier généré périmé ; le hook de démarrage le signale |
| Pas de recul silencieux | Chaque capacité a un niveau par harness (`CAPABILITIES`) ; le job CI `parity` le prouve et publie [`docs/parite.md`](../parite.md) |
| Rien d'écrasé par surprise | `hx adapters` refuse un fichier existant qu'il n'a pas écrit, sauf `--force` |

## Conséquences
- Un nouveau skill, agent, rule ou hook arrive dans les cinq harness sans travail de plus.
- Ce qu'un harness ne sait pas faire est déclaré « dégradé » ou « absent », avec sa raison, au lieu d'être caché.
- Les formats ont été relevés dans les documentations officielles, et les hooks rejoués dans le protocole de chaque harness. La CI valide par de vrais outils ce qui peut l'être sans clé d'API (règles Codex par la CLI Codex, `opencode.json` par le schéma officiel, TOML et YAML par leurs parseurs). Le plugin OpenCode, les hooks Antigravity et le pont DeepSeek ne tournent sur aucun binaire en CI : un changement de format côté éditeur s'y voit à l'usage, pas au test.
- La garde de livraison vit dans `hx` (`ship-gate`, `openspec archive`), pas seulement dans un hook : elle vaut même là où les hooks ne voient pas le lancement d'un skill.
- DeepSeek Harness est en préversion, et son pont de hooks est expérimental : c'est le portage le plus fragile.

## Révision
Un harness change de format de hooks ou de sous-agents ; un harness passe sous le plancher de parité (66 %) ; un des quatre n'est plus utilisé (retirer son adaptateur, voir [`elagage.md`](../elagage.md)).
