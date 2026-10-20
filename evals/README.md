# Evals comportementales

Chaque scénario lance un agent Claude Code **headless** (`claude -p`) sur un projet de démo où le template vient d'être installé, puis note le résultat avec un script **déterministe**.

| Scénario | Ce qui est évalué | Notation |
|---|---|---|
| `setup` | `/hx-setup` personnalise le projet sans intervention | part du contrat vide ; carte remplie, profil d'architecture, commande test réelle (un test canari en échec doit la faire échouer), `hx doctor` sans erreur |
| `tdd-s` | Une petite demande reste en piste S, test d'abord | pas de change OpenSpec ; dans le transcript, test écrit avant `src/mult.js` puis lancé **au rouge** avant le premier vert ; `mult` vérifié par la notation ; les tests échouent sur un `mult` faux ; `hx check` vert |
| `implement-m` | `hx-implement` réalise un change OpenSpec déjà validé (`x-validated`) | tâches cochées, scénarios tagués `@scenario`, `mult(2, 3)` et `mult(7, 0)` vérifiés par la notation, pour chaque scénario, un fichier de test tagué échoue **à lui seul** quand seul son comportement est faux, `hx check` vert |
| `architect` | `hx-architect` reste proportionné | `hx-architect` réellement lancé, ligne finale unique `Niveau visé : 0` ou `1`, aucun fichier modifié hors `docs/` et `openspec/changes/` depuis le commit initial (un commit de l'agent ne cache rien) |

```bash
evals/run.sh                               # tous les scénarios, une fois
evals/run.sh --runs 10 implement-m         # taux de réussite k/n
evals/run.sh --runs 10 --without hx-tdd tdd-s   # A/B : le skill apporte-t-il quelque chose ?
EVAL_MODEL=<id> evals/run.sh               # autre modèle que celui épinglé
```

| Variable | Défaut | Rôle |
|---|---|---|
| `EVAL_MODEL` | `claude-sonnet-5-5` | Modèle épinglé (`--model`), pour comparer des campagnes entre elles |
| `EVAL_TIMEOUT` | `1200` | Délai maximal d'une exécution, en secondes |
| `EVAL_MAX_TURNS` | `80` | Tours maximum de l'agent |
| `COPIER_VERSION` | `9.19.1` | Version de copier qui installe le template |

- **Coût réel** : chaque exécution consomme des tokens. La colonne coût l'affiche.
- **Statistique** : avec moins de 10 exécutions par scénario, impossible de distinguer 90 % de 70 % de réussite ; `run.sh` le rappelle. Une décision d'élagage se prend sur `--runs 10` au moins.
- **Version évaluée** : le template du commit `HEAD` (`copier --vcs-ref HEAD`) ; ses modifications non commitées ne sont pas évaluées. Les correcteurs (`lib/`, `scenarios/`) et les fixtures viennent en revanche de l'arbre de travail : commite-les avant une campagne de mesure, car le champ `sha` ne désigne que `HEAD`.
- **Isolation** : chaque exécution a son propre dossier temporaire (`setup.log`, `transcript.jsonl`, `result.txt`, `grade.log`), conservé en cas d'échec ; son chemin est affiché. Un échec de préparation (copier, `setup.sh`) donne le verdict `ERREUR` avec la fin du journal, sans interrompre la campagne.
- **Préparation** : `setup.sh` du scénario, s'il existe. `lib/configure.sh` écrit le contrat (`hx detect --write`) et installe les dépendances ; le scénario `setup`, dont c'est l'objet, ne l'appelle pas.
- **Graders testés** : `tests/evals.test.mjs` vérifie les aides de notation (`test-first.mjs`, `only_changed`, mutants) sur des transcripts et projets synthétiques. Un mutant qui ne se charge pas, ou des tests déjà rouges avant mutation, font échouer la notation au lieu de compter un faux « détecté ».
- **Intégrité de la notation** : avant de noter, `.harness/hx.mjs` et `.harness/hooks.mjs` sont restaurés depuis l'état initial, et toute modification de `.harness/config.json` fait échouer l'exécution. Seul un scénario qui contient un fichier `config-writable` (`setup`) peut écrire le contrat ; sa notation vérifie alors que les commandes exécutent vraiment les tests. Pour lui, `run.sh` exporte `HX_ALLOW_CONFIG_EDITS=1` : en headless, la confirmation que le hook `PreToolUse` demande avant d'écrire le contrat vaudrait refus.
- **Permissions** : l'agent tourne en `acceptEdits`, sans aucune règle Bash ajoutée. Les commandes passent par les seules permissions du template (`.claude/settings.json`), comme chez l'utilisateur. Un appel refusé fait échouer l'exécution (`no_permission_denials`) : c'est une confirmation que l'utilisateur aurait dû donner.
- **A/B (`--without`)** : retire le skill (ou l'agent) et supprime chaque ligne qui le cite dans `CLAUDE.md`, `.claude/rules/*.md`, `openspec/config.yaml`, les autres `SKILL.md` et les agents. Limite : la suppression est ligne à ligne ; une phrase ou une ligne de tableau qui citait aussi d'autres skills disparaît entière, et un prompt de scénario qui nomme le composant (`architect` et `hx-architect`) le cite toujours.
- **Résultats** (principe P9) : chaque campagne écrit `evals/results/<date>-<variante>.jsonl`, une ligne JSON par exécution (date, sha, scénario, variante, exécution, `pass`, verdict, **raison** de l'échec, durée, coût, version de `claude`, modèle, dossier conservé). La raison n'existe que depuis v0.3.0 : les campagnes antérieures n'en ont pas. La raison est la première ligne `✗` du journal de notation. Ces fichiers ne sont pas commités automatiquement : commite ceux qui servent de mesure, pour construire l'historique utilisé par la [revue d'élagage](../docs/elagage.md).
- **Élagage** : un skill dont le taux de réussite ne baisse pas quand on le retire (`--without`) est candidat au retrait.
- **En local seulement, sans clé d'API** : `run.sh` appelle `claude -p`, qui utilise la session Claude Code de la personne qui lance les evals (le coût est celui de son abonnement). Pas de job d'evals en CI. Commite le JSONL produit dans `evals/results/`.
