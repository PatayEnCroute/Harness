# Changelog

Versions du template, au format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les projets reçoivent une version par `uvx copier update --trust`.

## [Non publié]

Démarrage en une commande (`npx`) ; incohérences levées entre les prompts, `hx.mjs` et la doc.

### Ajouté
- **Lanceur `npx github:PatayEnCroute/Harness`** (`bin/harness.mjs`) : installation en une commande. Il fait `git init` dans un dossier vide, refuse un arbre git sale ou un projet déjà installé, installe uv s'il manque (après accord), lance Copier puis ouvre Claude Code sur `/hx-setup`. Les autres options vont à Copier (`--vcs-ref`, `--defaults`). Testé par `tests/launcher.test.mjs` et `tests/e2e-launcher.sh`.

### Modifié
- **Démarrage** : de 4 étapes à 1 commande. Le hook de démarrage de session installe la CLI OpenSpec aussi en local quand elle est absente (une autre version installée est laissée : elle sert peut-être un autre projet, `hx doctor` le signale). `hx doctor` n'est plus une étape à part : `/hx-setup` le lance.
- **`hx check`, étape `pistes`** : un change en cours sans `x-track` est une erreur, plus un avertissement (sans piste, aucune règle de piste ne s'appliquait). `hx-triage` et `docs/PLAN.md` le disent.
- **Seuil `arch`** : « au moins trois features dont les frontières comptent », dans `hx-setup` comme dans `arch-rules.md`.
- **`hx-setup`** : `.claude/settings.json` reste hors de portée, sauf la fusion des réglages d'un projet existant (étape 1).
- **`hx-discover`** : l'agent fait et coche lui-même les tâches du change de base (`hx-implementer` refuse une tâche qui n'est qu'un test) ; pas de `hx-review`, aucun code de production ne change.
- **Archive** : `openspec/config.yaml` et `hx-ship` disent la même chose : `hx check` après l'archive, commit seulement s'il est vert.
- **Prompts** : `hx-security-reviewer` cite la CI parmi ses déclencheurs, comme `hx-review` ; la description de `hx-learn` cite la forme « Note » (`docs/learnings/`).
- Commentaire de `DEFAULT_TEST_PATTERN` : il dit en quoi il diffère de `.claude/rules/testing.md` (`specs?/`, `e2e/`, `.feature`, `.robot`).
- **Documentation remise à jour** après un audit des incohérences entre docs et code :
  - `docs/PLAN.md` : statut v0.3.0, workflow conforme à `CLAUDE.md` (piste S sans revue ni ship, archive faite par `/hx-ship`), `hx trace` et `hx migrate` documentés, `hx-explorer` en `haiku`, chemins protégés et `permissions.deny`, arborescences complètes, contrat OpenSpec dans `npm run test:contract` ;
  - README : schéma du workflow, permissions, conflits vus par `hx doctor`, désinstallation complète ;
  - `docs/elagage.md` : réserve sur les mesures étendue aux 4 scénarios, coût réel, ligne de base non archivée ; candidat « template de PR » retiré (déjà dans `hx-ship`) ;
  - `evals/README.md` : version évaluée (correcteurs pris dans l'arbre de travail), champs du JSONL ;
  - ADR-003 et ADR-004 : section Conséquences ; ADR-004 : procédure de montée avec `npm run test:contract`.

### Corrigé
- **`hx doctor`** voit aussi `CLAUDE.md.rej`, `openspec/config.yaml.rej` et `.github/workflows/hx-check.yml.rej`.

## [0.3.0] — 2026-10-18

Fiabilisation issue de la revue du 2026-10-18 : mesurer juste, plus de faux verts, protections vues par git.

### Modifié
- **`hx run <cmd> --file`** hors de tout composant qui définit la commande : code 3 au lieu de 0 (un test ciblé qui « passe » sans avoir tourné faussait le rouge de `hx-tdd`). `--file-only` (hooks) garde 0. `--file` et `--component` sont exclusifs.
- **Hook `Stop` fondé sur git** : il voit les écritures faites par Bash et les fichiers commités pendant la session ; ce qui était modifié avant la session est ignoré. L'état n'est plus écrit par `PostToolUse` (plus de lecture-écriture concurrente). Hors d'un dépôt git, aucun contrôle.
- **Délais** : `lint-file` arrêté à 100 s, contrôles du hook `Stop` limités à 570 s, sous les délais de `settings.json` (vérifié par un test).
- **`hx trace`** échoue sur une spec dont aucun scénario n'est lu, au lieu d'afficher 100 %.
- **Prompts** : contradictions levées (refactor de piste S et test de caractérisation, exceptions au test d'abord, tâches d'un change de base, `hx-implement` obligatoire, indexation des seuls fichiers de la tâche, revue non indépendante déclarée sans sous-agents, niveau 4 documenté). `CLAUDE.md` ne recopie plus les critères de piste de `hx-triage`.
- **Evals** : `only_changed` compare au commit initial (un commit de l'agent ne cache plus rien) ; mutants vérifiés (tests verts avant, mutant qui se charge) et, pour `implement-m`, détectés par le test tagué du scénario seul ; `test-first` exige un lancement au rouge avant le premier vert ; la raison de chaque échec est enregistrée.
- **Evals retirées de la CI** : elles se lancent en local (`evals/run.sh`), avec la session Claude Code de l'utilisateur (`claude -p`), sans clé d'API. Le job manuel qui attendait `ANTHROPIC_API_KEY` est supprimé.

### Ajouté
- **Chemins protégés** : liste unique, étendue à `.harness/versions.json` ; le hook `Stop` signale à l'utilisateur tout chemin protégé modifié pendant la session, quel que soit l'outil.
- **`permissions.deny`** : Claude n'édite jamais `hx.mjs`, `hooks.mjs` ni `versions.json`.
- **Question `codeowners`** : `.github/CODEOWNERS` sur les fichiers qui décident de ce qui s'exécute et sur les specs, pour qu'une PR n'assouplisse pas seule ses propres contrôles.
- **Version d'OpenSpec validée** avant d'être passée à `npx` ; `hx doctor` la signale.
- **Leçons relues** : `hx-triage` et `hx-clarify` cherchent dans `docs/learnings/`.
- `hx-explorer` en `model: haiku`.
- Tests : correcteurs des evals (`tests/evals.test.mjs`), contrat « chaque `/opsx:*` cité existe », tests anti-dérive des prompts.
- README : mise à jour, résolution de conflit, désinstallation ; Copier épinglé. `docs/elagage.md` : candidats non construits en attente du pilote.

## [0.2.1] — 2026-10-18

### Ajouté
- Première ligne de base des evals en `--runs 10` (`evals/results/`, synthèse dans `docs/elagage.md`). Mesures brutes : `architect` 10/10, `implement-m` 10/10, `setup` 10/10, `tdd-s` 8/10 (2 échecs attribués au correcteur, corrigé sans nouvelle mesure). `architect` et `implement-m` ont été mesurés avant le durcissement de leurs correcteurs.

### Modifié
- Fichiers CI conditionnels : `template/.github/` et `template/.harness/ci/` remplacent les dossiers nommés `{% if ci %}…{% endif %}`. La condition vit dans `_exclude` (`copier.yml`). Le rendu ne change pas ; l'e2e vérifie maintenant `ci=false`.
- Hook `PreToolUse` : `HX_ALLOW_CONFIG_EDITS=1` lève la confirmation sur `.harness/config.json` seulement, pour les exécutions sans humain. En headless, elle valait refus et faisait échouer l'eval `setup` (0/6) ; `evals/run.sh` l'exporte pour ce scénario.
- Hook `PreToolUse`, commandes Bash : tous les chemins protégés cités comptent, pas seulement le premier, et lancer `node .harness/hx.mjs` n'est plus pris pour une écriture de `hx.mjs` (cause du dernier échec de l'eval `setup`).
- Eval `architect` : le correcteur exige que `hx-architect` ait été lancé et ait rendu un résultat (transcript), au lieu de noter seulement la ligne finale.
- Eval `tdd-s` : `test-first` ignore le corps des heredocs et suit l'ordre des écritures dans une commande (test puis squelette = test d'abord) ; deux faux négatifs corrigés.
- `_min_copier_version` passe à 9.19.1, la version testée en CI (`_exclude` templaté).

## [0.2.0] — 2026-10-18

Corrections issues de la revue du 2026-10-18. Passage en 0.x : rien n'est encore éprouvé sur un vrai projet.

### Modifié
- **`hx check` n'est jamais vert sans test exécuté** : une étape `test` absente échoue, et un contrat invalide est refusé avant toute exécution (plus de plantage sur une commande mal typée).
- **Hook `Stop`** : contrôle seulement les composants dont Claude a édité du code pendant la session, au lieu de tout l'arbre git modifié et de tous les composants.
- **`tracks` du contrat enfin lu** par le contrôle des pistes : `spec`, `design` et `adr` par piste, pistes personnalisées acceptées ; tout ADR cité doit exister.
- **`openspec_version` calculée** (`when: false`) : une montée de version arrive enfin dans les projets existants au `copier update`.
- **Tâches OpenSpec** : un comportement par tâche, test et code ensemble ; plus de tâche « écrire le test » séparée ni de tâche finale « check vert ».
- **`hx-spec-reviewer`** relit `git diff --cached` : les fichiers nouveaux d'une tâche ne lui échappent plus.

### Ajouté
- **`hx doctor`** : parse `.claude/settings.json`, vérifie le câblage des 4 hooks et détecte les restes de conflit de `copier update` (marqueurs, `.rej`).
- **Hook `PreToolUse`** : confirmation avant d'écrire `.harness/config.json`, `hx.mjs`, `hooks.mjs` ou `.claude/settings*.json`, via Edit/Write ou par une commande Bash ; chemins résolus (liens symboliques).
- Contrat cassé : les hooks le signalent à Claude au lieu de se désactiver en silence.
- ADR-004 : OpenSpec comme dépendance centrale, procédure de montée de version et critères de sortie.
- Tests : 0 mutation survivante sur 26 dans `hx.mjs` et `hooks.mjs` (14 sur 14 survivaient avant ; campagne ponctuelle, aucun outil de mutation versionné pour la rejouer) ; e2e `copier update` avec conflit dans la même zone et montée de version d'OpenSpec.

### Ajouté (suite de la revue, points importants)
- **Trace** : seul un tag `@scenario` dans un fichier de test couvre un scénario (`trace.test_pattern` pour une autre convention) ; les tags du code de production sont listés à part.
- **`hx doctor`** signale un projet en retard sur le dernier tag du template.
- **`hx migrate`**, lancé à chaque `copier update` : ajoute à `.harness/config.json` les clés nouvelles du template, sans rien remplacer.
- **Projet existant** : marche à suivre dans le README ; `/hx-setup` récupère depuis git `CLAUDE.md`, `.claude/settings.json` et `openspec/config.yaml` remplacés.
- **Workflow** :
  - piste S sans test rouge artificiel pour un refactor ou un renommage (tests existants verts avant et après), critères S harmonisés entre `CLAUDE.md` et `hx-triage` ;
  - `hx-security-reviewer` emploie la même échelle que les autres relecteurs ;
  - le skill `openspec-apply-change` demande confirmation et renvoie vers `hx-implement`.
- **CI du template** :
  - actions épinglées par SHA et Dependabot ;
  - `ANTHROPIC_API_KEY` limité à l'étape evals, claude-code épinglé ;
  - unitaires sur Linux, macOS, Windows et Node 20.19 ; `npm test` hermétique, contrat OpenSpec dans `npm run test:contract` ;
  - shellcheck, `concurrency`, `timeout-minutes`, push sur `main` seulement.
- **CI livrée** (`hx-check.yml`) : SHA, branche par défaut configurable (`default_branch`), `concurrency`, timeout, Dependabot ; ses étapes `run:` sont exécutées par l'e2e.
- **Evals** :
  - graders durcis : niveau d'architecture sur une ligne imposée, comportement vérifié par mutants, test écrit avant le code d'après le transcript, `hx.mjs` restauré et `config.json` figé avant notation ;
  - `setup` n'est plus pré-résolu ;
  - `--runs N` avec taux k/n, modèle épinglé (`EVAL_MODEL`), timeout par exécution ;
  - A/B `--without` qui retire aussi les lignes citant le composant ;
  - résultats en JSONL dans `evals/results/`.

### Corrigé
- `--component toString` (et tout nom hérité du prototype) accepté comme composant.
- `--file` sans valeur lançait toute la suite.
- `hx doctor` plantait sur un `path` non textuel.

## [0.1.0] — 2026-10-18

Phases 0 à 3 du plan : template Copier, CLI `hx`, 12 skills, 7 agents, 3 rules, 4 hooks, CI, evals. Annoncée à tort comme v1.0.
