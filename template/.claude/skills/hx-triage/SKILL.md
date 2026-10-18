---
name: hx-triage
description: Choisit le niveau de processus (piste S, M ou L) d'une demande de changement avant d'écrire du code ou une spec. À utiliser au début de toute demande de fonctionnalité, de correction, de refonte ou de migration.
---

# hx-triage : choisir la piste

Le processus est proportionné au risque. Choisis **la piste la plus légère** qui couvre le risque réel.

| Piste | Critères | Suite |
|---|---|---|
| **S** | Tous vrais : diff descriptible en une phrase ; aucun comportement spécifié ne change (un correctif rétablit le comportement attendu) ; aucun contrat public touché | `hx-tdd` (ou `hx-debug` pour un bug) ; refactor ou renommage : tests existants verts avant et après (test de caractérisation d'abord si aucun ne couvre le code, voir `hx-tdd`). Puis `hx-verify` et un commit |
| **M** | Comportement nouveau ou modifié, dans l'architecture existante | `hx-clarify` si la demande est floue → `/opsx:propose` → `hx-implement` → `hx-verify` → `hx-review` → `/hx-ship` |
| **L** | Un seul suffit : nouveau contrat public (API, format, schéma de données), migration, changement de niveau d'architecture, décision difficilement réversible | M, plus `hx-architect` → `design.md` + ADR (`hx-adr`) → **relecture du design par l'utilisateur avant d'implémenter** |

**Sans specs** (projet existant pas encore couvert par OpenSpec), « spécifié » veut dire observable par un utilisateur ou un appelant : un comportement nouveau est M, même si aucune spec ne le décrit encore.

## Étapes

1. Reformule la demande en une phrase.
2. Si l'impact n'est pas évident, lance `hx-explorer`. Ne suppose pas.
3. Choisis la piste. Entre deux pistes, prends la plus légère et dis quel signal la ferait monter.
4. Annonce : `Piste X : raison en une ligne. Prochaine étape : …`
5. Pour M ou L, une fois le change créé par `/opsx:propose`, ajoute `x-track: M` (ou `L`) dans `openspec/changes/<change>/.openspec.yaml`. `hx check` le vérifie.

## En cours de route

Si tu découvres un contrat public touché, une migration de données ou le besoin d'une nouvelle couche : arrête-toi, annonce le changement de piste et reprends à la bonne étape.

## Pièges

| Pensée | Réalité |
|---|---|
| « C'est petit, je saute la spec », alors qu'un comportement observable change | Piste M |
| « Je fais une spec complète pour un renommage » | Piste S |
| « Je verrai l'architecture en codant », sur un nouveau contrat public | Piste L |
