# Moins de sous-agents : ce que ça change pour le harness

> Analyse de « [Building agents: When to fold subagents into your main agent loop](https://claude.com/blog/building-agents-when-to-fold-subagents-into-your-main-agent-loop) » (Anthropic, 22/10/2026) et de la discussion sur X qui a suivi. Rédigée le 27/10/2026.

## Verdict

**Rien à changer.** Le billet combat la prolifération d'agents. Le harness en a 7, dont 6 que le billet dit de garder. Le seul point discutable, `hx-implementer`, rejoint la revue d'élagage ([journal](../elagage.md#journal)).

---

## Ce que dit le billet

> « *Using fewer subagents in favor of progressively disclosed context and tools can improve quality.* »

| Replier un sous-agent quand… | Le garder quand… |
|---|---|
| Il reçoit un relais d'un autre agent : chaque relais perd des détails | Il vérifie de façon indépendante, en boîte noire |
| Il découpe par type de problème ou par équipe (loi de Conway) | Il travaille en parallèle dans un contexte neuf et jetable |
| Les skills chargés à la demande suffisent | Il lit bien plus que ce dont l'agent principal a besoin ensuite |

Méthode : mesurer d'abord, replier **un sous-agent à la fois**, comparer avec et sans.

**À relativiser** : le billet vise des agents d'entreprise (support client), pas des agents de code. Il ne publie aucun chiffre de qualité, et son kit admet deux exécutions sur un seul modèle. Le « arrêtez les sous-agents » lu sur X simplifie : le billet en garde trois usages.

---

## Le harness au crible

| Le billet combat | Le harness |
|---|---|
| Des dizaines d'agents, un par équipe | 7 agents, un utilisateur |
| Des prompts contradictoires empilés | `CLAUDE.md` ≤ 100 lignes, rules ciblées par chemin, `hx-dream` |
| Des spécialistes qui se passent le travail | 6 agents sur 7 relisent ou explorent, sans rien écrire |

| Agent | Verdict |
|---|---|
| `hx-explorer`, `hx-verifier`, `hx-architect` (contre-relecture), `hx-spec-reviewer`, `hx-code-reviewer`, `hx-security-reviewer` | ✅ Gardés par le billet : exploration large ou vérification indépendante. P5 « qui produit n'évalue pas » tient. |
| `hx-implementer` (un contexte neuf par tâche) | ⏸️ Seul relais au sens du billet : il est lancé une fois par tâche. On le garde : `implement-m` passe 10/10, et sur les changes courts d'un projet solo le gain attendu est faible. |

**Signal de réouverture** : un change de 5 tâches ou plus paraît lent ou cher. Il faudra alors une eval de 5 tâches ou plus, liées entre elles (`implement-m` n'en a que 2, indépendantes), et un A/B contre une boucle unique qui garde la relecture après chaque tâche.

## Sources

- Anthropic, [Building agents: When to fold subagents into your main agent loop](https://claude.com/blog/building-agents-when-to-fold-subagents-into-your-main-agent-loop), 22/10/2026, et son [kit de migration](https://github.com/anthropics/single-agent-loop-kit)
- Discussion : [fil X de @CodeByNZ](https://x.com/CodeByNZ/status/2114296698533040158) (lu via ses citations), [The Decoder](https://the-decoder.com/anthropic-says-one-ai-agent-beats-many-subagents-now-that-models-can-handle-complexity-alone/), [SmartScope](https://smartscope.blog/en/blog/anthropic-fold-subagents-into-single-agent-loop-3-2026/)
