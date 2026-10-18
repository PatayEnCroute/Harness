---
name: hx-triage
description: Choisit le niveau de processus (piste S, M ou L) d'une demande de changement avant d'écrire du code ou une spec. À utiliser au début de toute demande de fonctionnalité, de correction, de refonte ou de migration.
---

# hx-triage : choisir la piste

Le processus est proportionné au risque. Choisis **la piste la plus légère** qui couvre le risque réel.

| Piste | Critères | Suite |
|---|---|---|
| **S** | Tous vrais : diff descriptible en une phrase ; aucun comportement spécifié ne change (un correctif rétablit le comportement attendu) ; aucun contrat public touché | `hx-tdd` (ou `hx-debug` pour un bug) ; refactor ou renommage : tests existants verts avant et après (test de caractérisation d'abord si aucun ne couvre le code, voir `hx-tdd`). Puis `hx-verify` et un commit |
| **M** | Comportement nouveau ou modifié, dans l'architecture existante | `hx-clarify` si la demande est floue → `/opsx:propose` → **porte de cadrage** → run : `hx-implement` → `hx-verify` → `hx-review` → `/hx-ship` |
| **L** | Un seul suffit : nouveau contrat public (API, format, schéma de données), migration, changement de niveau d'architecture, décision difficilement réversible | M, plus `hx-architect` → `design.md` + ADR (`hx-adr`), validés à la **porte de cadrage**, avant le run |

**Sans specs** (projet existant pas encore couvert par OpenSpec), « spécifié » veut dire observable par un utilisateur ou un appelant : un comportement nouveau est M, même si aucune spec ne le décrit encore.

## Étapes

1. Reformule la demande en une phrase.
2. Si `docs/learnings/` existe, cherches-y les mots-clés de la demande (`git grep -i <mot> -- docs/learnings`) : une leçon passée peut changer la piste.
3. Si l'impact n'est pas évident, lance `hx-explorer`. Ne suppose pas.
4. Choisis la piste. Entre deux pistes, prends la plus légère et dis quel signal la ferait monter.
5. Annonce : `Piste X : raison en une ligne. Prochaine étape : …`
6. Pour M ou L, une fois le change créé par `/opsx:propose`, ajoute `x-track: M` (ou `L`) dans `openspec/changes/<change>/.openspec.yaml`. `hx check` échoue tant qu'un change en cours n'a pas de piste.
7. Pour M ou L, passe la **porte de cadrage** (ci-dessous) avant tout code.

## Porte de cadrage (M et L)

C'est le seul arrêt prévu entre la demande et le rapport de fin de run. C'est là qu'on vérifie que la spec dit bien ce que l'utilisateur a demandé : après, le run suit la spec à la lettre.

1. **Montre**, en un seul message : la demande d'origine en une phrase ; le pourquoi et les non-objectifs de `proposal.md` ; la liste des scénarios (WHEN/THEN) ; en L, le niveau visé et la décision de `design.md`, ainsi que les ADR. Signale chaque point où tu as **déduit** au lieu de recopier la demande.
2. **Attends une validation explicite**. Une correction : modifie la proposition et remontre-la. Ne commence jamais à coder sans validation.
3. **Validé** : ajoute `x-validated: AAAA-MM-JJ` dans `.openspec.yaml` (en L, l'ADR passe à `Accepté`). Ne commite pas le change dans le dossier principal : `hx worktree` le commite sur sa branche, et un change commité ici y resterait.
4. **Où lancer le run** :
   - **Par défaut, dans son worktree.** Le worktree part du HEAD du dossier principal : mets d'abord ce dossier à jour (`git pull`, s'il suit un dépôt distant). Lance ensuite `node .harness/hx.mjs worktree <change>`. La commande refuse un change sans `x-validated`, déplace le change et ses ADR sur leur propre branche dans un dossier frère, puis affiche la commande qui lance le run. **Donne cette commande à l'utilisateur** : le dossier principal est de nouveau libre pour cadrer le change suivant.
   - En L, si l'ADR change le niveau d'une feature (`hx-adr`, étape 6), modifie le `.harness/config.json` **du worktree** et commite-le là (`git -C <worktree> commit`). Ne le fais pas dans le dossier principal : `hx worktree` refuse un harness modifié.
   - **Si l'utilisateur préfère le run dans cette session** : pas de `hx worktree`, enchaîne `hx-implement`.

## En cours de route

Si tu découvres un contrat public touché, une migration de données ou le besoin d'une nouvelle couche : arrête-toi et annonce le changement de piste. Retire `x-validated` : le cadrage reprend avec l'utilisateur, jusqu'à la porte.

## Pièges

| Pensée | Réalité |
|---|---|
| « C'est petit, je saute la spec », alors qu'un comportement observable change | Piste M |
| « Je fais une spec complète pour un renommage » | Piste S |
| « Je verrai l'architecture en codant », sur un nouveau contrat public | Piste L |
