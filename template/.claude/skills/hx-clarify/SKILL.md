---
name: hx-clarify
description: Lève les ambiguïtés d'une demande avant de rédiger une proposition OpenSpec, avec au plus cinq questions ciblées en un seul message, chacune avec une réponse par défaut. À utiliser quand une demande de piste M ou L laisse un doute sur le besoin, le périmètre, les cas limites ou les critères d'acceptation.
---

# hx-clarify : clarifier avant de spécifier

Une question coûte une minute ; une spec fausse coûte un change entier. Mais une question inutile coûte aussi : ne demande que ce qui changerait la spec.

## Étapes

1. Reformule le besoin en une phrase : qui, quoi, pourquoi.
2. Lis le contexte avant de demander : code concerné (`hx-explorer` si besoin), specs existantes dans `openspec/specs/`, `.harness/project.md`. Ne pose pas une question dont la réponse est dans le dépôt.
3. Liste les ambiguïtés, puis garde **au plus 5** questions, par ordre d'impact sur la spec :
   - **besoin** : quel problème, pour qui ;
   - **périmètre** : ce qui est inclus, et surtout ce qui est exclu (non-objectifs) ;
   - **comportement** : cas limites, erreurs, valeurs concrètes ;
   - **acceptation** : comment saura-t-on que c'est réussi ;
   - **contraintes** : performance, sécurité, compatibilité.
4. Pose-les **en un seul message**, numérotées, chacune avec une **réponse par défaut** que tu appliqueras si l'utilisateur ne répond pas.
5. Rédige un **brief** de 10 lignes au plus : besoin, périmètre, non-objectifs, scénarios clés en WHEN/THEN, contraintes.

Ensuite : `/opsx:propose` avec ce brief.

## Pièges

| Pensée | Réalité |
|---|---|
| « Je demande tout, au cas où » | Cinq questions au plus, celles qui changent la spec |
| « Je suppose, ça ira plus vite » | Une supposition non dite devient un bug spécifié |
| « Question ouverte : qu'en penses-tu ? » | Toujours une réponse par défaut, concrète |
