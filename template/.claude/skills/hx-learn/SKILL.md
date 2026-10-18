---
name: hx-learn
description: Capitalise après une livraison, un incident ou une erreur répétée de l'agent. Transforme la leçon en contrôle, rule ou skill, ou en note (`docs/learnings/`) si elle n'appelle aucune action, au bon niveau (projet ou template Harness). À utiliser après un merge, un incident, ou quand la même correction revient pour la deuxième fois.
---

# hx-learn : la boucle de pilotage

Chaque erreur répétée est un défaut du harness, pas seulement du code. On la corrige au niveau le plus **déterministe** possible.

## Étapes

1. **Recueillir** : qu'est-ce qui a coûté du temps ? Correction répétée, bug passé en revue, malentendu de spec, commande qui manquait, contrôle trop lent ou trop bruyant.
2. **Retenir** au plus 3 leçons, celles qui reviendront.
3. **Choisir la forme**, par ordre de préférence :

   | Forme | Quand | Où |
   |---|---|---|
   | **Contrôle déterministe** | La règle se vérifie par un outil : lint, test, règle `arch`, commande du contrat | Projet : `.harness/config.json`, config de l'outil, tests |
   | **Rule** | Convention qui ne se vérifie pas mécaniquement | Projet : `.claude/rules/stack-*.md` ou `.harness/project.md` |
   | **Skill ou agent** | Procédure en plusieurs étapes qui revient | Template Harness |
   | **Note** | Contexte utile, sans action | Projet : `docs/learnings/AAAA-MM-JJ-sujet.md`, 15 lignes au plus, relue par `hx-triage` et `hx-clarify` : mets les mots-clés du sujet dans le titre |

4. **Niveau** :
   - **propre au projet** : applique la correction dans le projet ;
   - **générique** (vaut pour tous les projets) : rédige une proposition pour le template Harness. Le dépôt source est `_src_path` dans `.copier-answers.yml`. Si `gh` est disponible et que l'utilisateur est d'accord, ouvre une issue (`gh issue create -R <dépôt>`). Sinon, ajoute la proposition dans `docs/learnings/harness.md`.
5. **Élaguer** : si un contrôle, une rule ou un skill n'a servi à rien ou gêne, propose de le retirer. Un composant sans gain mesurable coûte du contexte.

## Format d'une proposition pour Harness

```markdown
### <titre>
- Constat : ce qui s'est passé, et combien de fois.
- Proposition : contrôle, rule ou skill, et son contenu.
- Preuve attendue : comment on saura que ça marche (eval, contrôle qui échoue avant et passe après).
```
