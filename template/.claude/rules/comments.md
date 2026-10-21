---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.mjs"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.py"
  - "**/*.cs"
  - "**/*.fs"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.java"
  - "**/*.kt"
  - "**/*.scala"
  - "**/*.rb"
  - "**/*.php"
  - "**/*.swift"
  - "**/*.dart"
---

# Commentaires : par défaut, aucun

Un commentaire n'est ni compilé ni testé : il s'écarte du code sans que rien ne le signale. Il ne porte que ce que ni le code, ni les tests, ni la spec, ni git ne peuvent porter.

## Le test

Si je supprime ce commentaire, un lecteur compétent perd-il une information introuvable dans le code, les tests, la spec ou `git log` ? Non → pas de commentaire.

## Autorisés (liste fermée)

| Cas | Exemple |
|---|---|
| **Pourquoi** non déductible : contrainte externe, contournement, choix contre-intuitif | `// L'API X renvoie 200 sur erreur : on lit status.` |
| **Contrat public** d'une API exportée, si la signature ne suffit pas : préconditions, erreurs levées, unités | docstring, JSDoc, XML doc |
| **Directive outil**, avec sa raison quand elle désactive un contrôle | `@scenario`, `eslint-disable-next-line <règle> -- <raison>`, `# type: ignore[<code>]`, en-tête de licence |

## Interdits

| Forme | Où va l'information |
|---|---|
| Paraphrase du code (`// incrémente i`) | Un meilleur nom, une fonction extraite |
| Valeur ou nom recopié (`// timeout 30 s`) | Nulle part : le code le dit |
| Historique, narration (`// corrigé`, `// nouveau`, `// avant on…`) | Message de commit |
| Code commenté | git |
| Exigence recopiée de la spec | OpenSpec ; le test porte `@scenario` |
| TODO, FIXME, HACK | `tasks.md` du change, ou un ticket |
| Bannière, séparateur, note au relecteur | Rien, ou le rapport |

## Écriture

- Une ou deux lignes, au présent, sans valeur déjà présente dans le code.
- Un docstring décrit le contrat (quoi), jamais les étapes de l'implémentation (comment).

## Cohérence

- Modifier du code, c'est relire ses commentaires (au-dessus, dans la fonction, le docstring) et les mettre à jour ou les supprimer **dans le même diff**.
- Un commentaire qui contredit le code est un bug : **bloquant** en revue (`hx-code-reviewer`).
- Hors du diff, ne nettoie pas les commentaires existants (un sujet par commit) : signale-les.
