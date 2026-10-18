# ADR-002 : Claude Code seul, standards quand c'est gratuit

- Statut : Accepté
- Date : 2026-10-17

## Besoin
Livrer des skills, agents, rules et hooks utiles au quotidien, sans payer la maintenance d'une compatibilité multi-outils dont il n'y a pas l'usage.

## Contexte
Un seul outil IA utilisé (Claude Code). Les standards ouverts couvrent les instructions (AGENTS.md) et les skills (`SKILL.md`), pas les agents, les hooks ni les rules ciblées.

## Options
| Option | Coût | Rend plus facile | Rend plus difficile | Réversible ? |
|---|---|---|---|---|
| Ne rien changer : format Claude Code natif | nul | tout | un futur 2ᵉ outil | oui |
| Génération multi-outils (rulesync, APM, générateur maison) | élevé : adaptateurs et tests par outil | changer d'outil | chaque évolution du harness | oui |
| **Format natif, mais skills au standard `SKILL.md`** | nul | un futur portage des skills | rien | oui |

## Décision
Format Claude Code natif (`CLAUDE.md`, `.claude/`). Les skills respectent la spec Agent Skills sans champ propriétaire inutile.

## Conséquences
Aucune couche de génération à maintenir. Ajouter un outil demandera d'écrire des adaptateurs (agents, hooks, rules), estimés à quelques jours.

## Révision
Usage régulier d'un deuxième outil IA sur ces projets.
