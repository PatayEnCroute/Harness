# Changelog

Versions du template, au format [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les projets reçoivent une version par `uvx copier update --trust`.

## [Non publié]

Plus aucune confirmation imposée par le harness : personne ne les relisait, et elles interrompaient aussi le mode Auto, qui décide désormais seul des actions risquées. L'archive OpenSpec reste le dernier commit, même quand la PR est demandée avant la décision sur les mineurs. Le cadrage d'un change M avec design ou L est contesté par un relecteur avant la porte.

### Ajouté
- **`hx trace` refuse deux scénarios de même nom dans une capability** ([#25](https://github.com/PatayEnCroute/Harness/issues/25)), dans les specs principales comme dans les delta specs d'un change : ils partageaient un identifiant, et un seul test tagué les couvrait tous les deux. L'échec cite les deux exigences.
- **`/hx-dream`** : consolide la mémoire du projet sur le modèle du sommeil, hors du workflow S/M/L. Six phases : inventaire et charge (endormissement), rejeu de chaque apprentissage contre le projet actuel (sommeil lent), oubli du périmé, de l'absorbé par un contrôle, du redondant et du trivial (homéostasie), fusion des épisodes en principes et hiérarchie par saillance (consolidation), associations entre leçons éloignées, en hypothèses sourcées (sommeil paradoxal), puis journal du rêve validé par l'utilisateur avant toute écriture (réveil). Aucune invention : chaque phrase gardée cite sa source. Ne touche ni aux fichiers du template, ni aux specs, ni aux ADR. `hx-learn` le propose quand `docs/learnings/` s'allonge.
- **`hx status`** : changes en cours de chaque worktree du dépôt, avec leur piste, leurs tâches et leur étape (cadrage, run à lancer, run en cours, verdict du rapport de fin de run). Le hook de démarrage de session signale les changes des autres worktrees et le verdict du rapport.
- **Rapport de fin de run persistant** : `hx-review` l'écrit dans `openspec/changes/<change>/run-report.md` et le commite ; il survit à la fermeture de la session du worktree, `/hx-ship` le relit, l'archive le conserve. Un run bloqué écrit aussi le sien.
- **Mesures d'élagage et `hx stats`** : `x-gate-corrections` et `x-gate-removed` (porte de cadrage, `hx-triage`), `x-review-confirmed` et `x-review-discarded` (`hx-review`) dans `.openspec.yaml`. `hx stats [--since AAAA-MM-JJ]` les additionne sur les changes archivés. Une clé absente veut dire « non mesuré ». `docs/elagage.md` s'appuie dessus, `hx-learn` les cite. Le contrat OpenSpec vérifie que `validate --strict` accepte ces clés et que l'archive conserve `run-report.md`.
- **Eval `gate-stops`** : une demande qui modifie un comportement doit produire un change M ou L valide, puis s'arrêter à la porte : ni `x-validated`, ni code, ni branche, ni worktree. Aide de notation `gate_held`, testée.
- **`/hx-explain`** : pédagogie pour un utilisateur non développeur, lancée à la demande, hors du workflow S/M/L. Trois modes : **décision** (pourquoi l'agent a fait X, avec sa raison réelle et l'alternative écartée ; une décision discutable est dite telle), **bilan** (comment l'utilisateur se sert du harness dans la session, grille ✅ ⚠️ ❌, trois conseils au plus, « rien à redire » est un résultat valide) et **notion** (un concept d'ingénierie logicielle en mots simples, avec un exemple pris dans le projet). Lecture seule. Un glossaire (`references/glossaire.md`) donne la même définition simple de chaque terme à chaque explication.
- **Politique stricte des commentaires** : rule `comments.md`, chargée sur les fichiers source. Par défaut aucun commentaire ; autorisés seulement le pourquoi non déductible, le contrat d'une API exportée et les directives d'outil (avec leur raison). Interdits : paraphrase, valeur recopiée, historique, code commenté, exigence recopiée de la spec, TODO. Modifier du code, c'est mettre à jour ou supprimer ses commentaires dans le même diff. `hx-code-reviewer` classe un commentaire qui contredit le code **bloquant**, une forme interdite **important** ; `hx-implementer` relit les commentaires à l'étape Refactor. `/hx-setup` (nouvelle étape 8, `references/comment-lint.md`) ajoute au linter existant les règles qui vérifient les formes : ESLint, Ruff, SonarAnalyzer, golangci-lint.
- **`/hx-security-audit`** : audit de sécurité de toute la solution, lancé à la demande, hors du workflow S/M/L. Inventorie les dépendances (version installée, lue dans le lockfile), cherche les CVE qui les touchent (outil d'audit de l'écosystème, puis osv.dev, GitHub Advisory ou NVD), confirme chaque candidat (plage affectée, usage de la fonction vulnérable), puis remonte chaque point d'exécution SQL non constant jusqu'à sa source. Lecture seule. « Aucun constat » est un résultat valide : le rapport montre la couverture, les constats prouvés, les doutes et les écartés.
- **Contre-relecture du cadrage** ([#14](https://github.com/PatayEnCroute/Harness/issues/14)) : en M avec `design.md` et en L, `hx-triage` lance un `hx-architect` neuf en relecteur du change avant la porte. Verdict par décision (garder, simplifier, retirer, changer), besoin réel servi, périmètre minimum. Les verdicts confirmés sont appliqués, puis `openspec validate --strict`. La porte montre les décisions retirées et le signal qui les ferait revenir. Un seul sous-agent, en lecture seule. « Qui produit ne juge pas » couvre désormais le cadrage (`CLAUDE.md`).

### Modifié
- **`hx trace`, scénarios des changes en cours** ([#27](https://github.com/PatayEnCroute/Harness/issues/27)) : la sortie affiche leur couverture (« Changes en cours : X/Y »), même complète ; avant, seule celle des specs principales se voyait, et un run a vérifié ses tags à la main. Un scénario sans test est un avertissement tant qu'une tâche du change reste, et un échec de `hx check` une fois toutes cochées, donc avant `hx-verify` et l'archive. Un change en cadrage ne rend plus le dossier principal rouge.
- **ADR corrigible jusqu'au merge** ([#26](https://github.com/PatayEnCroute/Harness/issues/26)) : l'immuabilité d'un ADR accepté commence quand il est sur la branche de base. Avant, l'ADR créé par le change s'aligne sur le code dans le même diff ; une décision changée sur le fond est un arrêt de run (`hx-implement`) et repasse la porte. `hx-spec-reviewer` vérifie que les ADR du change décrivent le code.
- **`hx-review`** : les constats `important` confirmés sont corrigés pendant le run, comme les bloquants ; un important hors du périmètre du change rejoint les mineurs proposés, avec sa raison. Avant, aucune suite n'était prévue pour eux.
- **`/hx-ship`** : reprend la base avant l'archive (`git pull --no-rebase --no-edit origin <base>`, sans réécriture d'historique), puis `hx check`. Un change mergé pendant le run a pu modifier les mêmes specs principales : le conflit se voit avant l'archive, pas au merge.
- **`/hx-discover`** archive par la CLI (`hx openspec archive <change> -y`), comme `/hx-ship`, au lieu de `/opsx:archive`, qui demandait une confirmation pour écrire dans `openspec/specs/`.
- **Page de présentation** (`docs/index.html`) : réduite aux sections En bref, Cycle de vie et Workflow. Nouvelle section « Les outils » : un arbre dessiné (un tronc, cinq branches, 37 feuilles : skills, CLI `hx`, agents, rules, hooks) ; cliquer une feuille déplie l'explication de l'outil (ce qu'il fait, quand il sert) dans une vue arborescente sous l'arbre.
- **Orienté Claude Code Desktop** : le lanceur ouvre Desktop sur le dossier (`claude --desktop`) ou dit comment faire, au lieu de lancer `claude /hx-setup` dans le terminal (toujours possible avec `--terminal`). `hx worktree` donne les étapes Desktop (nouvelle session sur le worktree, mode Auto, `/hx-implement <change>`) avant la commande terminal. `README.md` et `INSTALL.md` partent de Desktop.
- **Run en mode `auto`** : `hx worktree` affiche `claude --permission-mode auto "/hx-implement <change>"` (avant : `acceptEdits`, qui ne couvre pas Bash).
- **`hx worktree`** reprend `.claude/settings.local.json` (permissions accordées dans le dossier principal, non suivies par git) dans le worktree.
- **Permissions** : en plus, sans confirmation, `git log`/`show` seuls, `rev-parse`, `ls-files`, `ls-remote`, `blame`, `branch` (lecture, `-d`), `pull`, `worktree list`, `gh pr create/checks/view`, `ls`, `cat`, `head`, `tail`, `wc`. Un test vérifie que chaque commande citée par `CLAUDE.md`, un skill ou un agent est autorisée, ou laissée exprès au mode de permission (`git push`, `git rm`, `git worktree remove`, `gh issue create`).
- **Aucune confirmation imposée par le harness** : plus de règle `ask` dans `.claude/settings.json`, et le hook `PreToolUse` ne renvoie plus jamais `ask`. Une confirmation répétée n'est pas relue, et en mode Auto une règle `ask` ou un `ask` de hook interrompt quand même. Les actions risquées (`git push`, `git rm`, `git worktree remove`, `git bisect`, `gh issue create`…) reviennent au mode de permission : en Auto, son classifieur décide ; ailleurs, Claude Code demande comme pour toute commande non autorisée. `git bisect *` et `git worktree remove *` quittent `allow`, qui aurait laissé passer `bisect run` et `--force` sans avis du classifieur. Restent, sans solliciter personne : `permissions.deny` sur les outils Copier, le signalement des chemins protégés en fin de tour (hook `Stop`), un rappel ajouté au contexte de Claude quand il édite un chemin protégé, et le refus d'`openspec-apply-change` avec renvoi vers `hx-implement` (l'utilisateur garde `/opsx:apply`). La détection des écritures Bash et `HX_ALLOW_CONFIG_EDITS` disparaissent.
- **Evals** : plus de règles Bash propres aux evals. Elles tournent avec les permissions du template, et un appel refusé fait échouer l'exécution. Les evals mesurent donc aussi l'autonomie réelle.
- **Mineurs avant l'archive** ([#15](https://github.com/PatayEnCroute/Harness/issues/15)) : le rapport de fin de run de `hx-review` se termine par une question sur les mineurs (tous, une partie ou aucun). `/hx-ship` exige la réponse et les correctifs commités avant l'archive, même si la PR a été demandée d'avance. `CLAUDE.md` et `openspec/config.yaml` disent la même chose.
- **Correctif après l'archive** (`/hx-ship`) : CI rouge ou retour tardif, sans `rebase` ni `push --force`. `git revert --no-edit` du commit d'archive (autorisé sans confirmation), correctif, puis nouvelle archive. Variante : PR ouverte sans l'archive, ajoutée en dernier commit avant le merge.
- **Archive par la CLI** (`/hx-ship`) : `node .harness/hx.mjs openspec archive <change> -y` remplace `/opsx:archive`. La synchronisation des specs principales est déterministe, sans écriture à la main dans `openspec/specs/` ni confirmation du hook.
- **Eval `ship-minors`** : demande de PR, puis mineur appliqué au tour suivant. L'archive doit rester le dernier commit, sans réécriture d'historique (aide `archive_is_last`, testée). `evals/run.sh` accepte un second tour (`followup.md`, `--continue`) et cumule coût, durée et refus de permission sur les tours.
- **Evals dans un dossier non approuvé** : `claude -p` ignore `permissions.allow` d'un projet non approuvé (*trust*), ce qui est le cas de chaque dossier temporaire des evals. Toute commande non lecture seule y était refusée. `run.sh` repasse les permissions du template par `--settings`.
- **README** réorganisé pour la lecture : promesse et bénéfices en tête, démarrage en deux étapes, workflow en schéma, détails (lanceur, permissions, désinstallation) repliés.
- **`docs/PLAN.md`** simplifié (512 → 385 lignes) : le workflow passe avant l'architecture, ce que le README ou le code disent déjà (usage, extrait de `copier.yml`, détail des hooks) est retiré, la roadmap tient en une ligne par phase.
- **`docs/elagage.md`** simplifié : méthode en schéma, composants groupés par rôle (workflow, cadrage, revue et mémoire, à la demande, toujours gardés), journal allégé avec ses réserves repliées.
- **Documentation** : le harness est éprouvé sur un vrai projet. README, PLAN et `docs/elagage.md` ne le disent plus « non éprouvé » ni n'attendent de pilote, et renvoient au dernier tag au lieu d'une version écrite en dur. Page de présentation : `docs/index.html`.

### Corrigé
- **Hooks dans un worktree natif de Desktop** (`.claude/worktrees/`) : `CLAUDE_PROJECT_DIR` y désigne le dossier principal, donc le lint, les contrôles du hook `Stop` et les chemins protégés portaient sur le mauvais dossier. Les hooks suivent désormais le `cwd` de la session quand il est dans un autre worktree du même dépôt.

## [0.5.0] — 2026-10-19

Un change M ou L se fait désormais en trois temps : cadrage avec l'utilisateur, run sans lui, livraison. L'utilisateur cadre le change suivant pendant le run.

### Ajouté
- **Porte de cadrage** (`hx-triage`) : le seul arrêt prévu en M et L. Proposition, scénarios et design sont montrés en un message, avec les points déduits plutôt que recopiés de la demande. Après validation explicite, `x-validated: AAAA-MM-JJ` va dans `.openspec.yaml`. `hx-implement` refuse de démarrer sans lui. Le hook de démarrage de session affiche l'état du cadrage de chaque change. Le contrat OpenSpec vérifie que `validate --strict` accepte la clé.
- **`hx worktree <change>`** : une branche et un worktree frère par change. La commande refuse un change sans `x-validated`. Un change nouveau (non suivi, ou seulement indexé) y est déplacé et commité, avec les ADR cités par son `design.md`. Un change déjà commité reste aussi dans le dossier principal, et la commande le signale. La commande affiche celle qui lance le run (`claude --permission-mode acceptEdits "/hx-implement <change>"`). Le dossier principal reste vert et libre pour cadrer la suite. Testé en unitaire et dans `tests/e2e-openspec.sh`.
- **Rapport de fin de run** (`hx-review`) : verdict, vérification, hypothèses à confirmer, revue, mineurs proposés, prochaine étape. `hx-implementer` rend ses hypothèses, `hx-ship` les reprend dans la PR.

### Modifié
- **Run sans interruption** : `hx-implement` enchaîne `hx-verify` et `hx-review` sans rendre la main, et liste les seuls arrêts autorisés. Les mineurs de `hx-review` vont dans le rapport au lieu d'être posés en question.
- **Permissions** : git local (`status`, `diff`, `log`, `show`, `grep`, `add`, `commit`) sans confirmation. Un commit par tâche et le `git diff` des relecteurs ne demandent plus d'accord à chaque fois. `git push` reste confirmé.
- L'eval `implement-m` part d'un change validé (`x-validated`).

### Mise à jour
- Un change en cours créé avant cette version n'a pas `x-validated` : `hx-implement` refusera de le reprendre. Passe la porte de cadrage, ou ajoute la clé si la proposition a déjà été relue.

## [0.4.0] — 2026-10-18

Démarrage en une commande, par une personne (`npx`) ou par un agent (`INSTALL.md`) ; incohérences levées entre les prompts, `hx.mjs` et la doc.

### Ajouté
- **Lanceur `npx github:PatayEnCroute/Harness`** (`bin/harness.mjs`) : installation en une commande. Il fait `git init` dans un dossier vide, refuse un arbre git sale ou un projet déjà installé, installe uv s'il manque (après accord), lance Copier puis ouvre Claude Code sur `/hx-setup`. Les autres options vont à Copier (`--vcs-ref`, `--defaults`). Sans terminal (agent, CI), il exige `--defaults` avant toute écriture. Testé par `tests/launcher.test.mjs` et `tests/e2e-launcher.sh`.
- **`INSTALL.md`** : installation par un agent (Claude Code local ou cloud). Vérifications, questions de Copier posées à l'utilisateur, commande non interactive (`--defaults`, `--data`, `--overwrite` pour un projet existant), redémarrage de session puis `/hx-setup` tapé par l'utilisateur. Un test vérifie que chaque question de `copier.yml` y figure.

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
