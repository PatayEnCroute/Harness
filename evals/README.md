# Evals comportementales

Chaque scénario lance un agent Claude Code **headless** (`claude -p`) sur un projet de démo où le template vient d'être installé, puis note le résultat avec un script **déterministe**.

| Scénario | Ce qui est évalué | Notation |
|---|---|---|
| `setup` | `/hx-setup` personnalise le projet sans intervention | carte remplie, profil d'architecture, `hx doctor` sans erreur |
| `tdd-s` | Une petite demande reste en piste S, test d'abord | pas de change OpenSpec, test présent, `hx check` vert |
| `implement-m` | `hx-implement` réalise un change OpenSpec | tâches cochées, scénarios tagués `@scenario`, `hx check` vert |
| `architect` | `hx-architect` reste proportionné | niveau 0 ou 1 recommandé, aucun code écrit |

```bash
evals/run.sh                          # tous les scénarios, une fois
evals/run.sh --runs 3 implement-m     # variance
evals/run.sh --without hx-tdd tdd-s   # A/B : le skill apporte-t-il quelque chose ?
```

- **Coût réel** : chaque exécution consomme des tokens. La colonne coût l'affiche.
- **Isolation** : chaque exécution a son propre dossier temporaire, conservé en cas d'échec pour l'inspecter.
- **Permissions** : l'agent tourne en `acceptEdits` avec une liste fermée de commandes (`node`, `npm`, `npx`, `git`, `openspec`, `ls`, `cat`).
- **Élagage** (principe P9) : un skill dont le taux de réussite ne baisse pas quand on le retire (`--without`) est candidat au retrait.
- En CI : workflow manuel `evals`, actif seulement si le secret `ANTHROPIC_API_KEY` est défini.
