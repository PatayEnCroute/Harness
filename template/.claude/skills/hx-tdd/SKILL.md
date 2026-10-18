---
name: hx-tdd
description: Discipline test d'abord (rouge, vert, refactor) avec preuve d'exécution. À utiliser pour tout changement de comportement du code, nouvelle fonctionnalité ou correctif, avant d'écrire le code de production.
---

# hx-tdd : test d'abord, avec preuve

**Loi : pas de code de production sans un test qui a d'abord échoué.**

## Cycle, un comportement à la fois

1. **Rouge** : écris le plus petit test qui exprime le comportement. S'il couvre un scénario de spec, tague-le `@scenario <capability>/<scénario>`. Lance `node .harness/hx.mjs run test --file <test>`. Il doit échouer **pour la bonne raison** : une assertion, pas une erreur d'import ou de syntaxe.
2. **Vert** : écris le minimum de code pour le faire passer. Relance.
3. **Refactor** : simplifie (noms, duplication) ; les tests restent verts. Relance les tests du composant.
4. Comportement suivant.
5. Pour finir : `node .harness/hx.mjs run test` et `node .harness/hx.mjs run lint`.

## Preuve

Dans ta réponse, montre un extrait de la sortie rouge puis de la sortie verte. Sans ces deux sorties, le cycle n'a pas eu lieu.

## Pièges

| Pensée | Réalité |
|---|---|
| « J'écris le test après » | Un test écrit après valide ce que le code fait, pas ce qu'il doit faire |
| « Trop simple pour un test » | Alors le test prend une minute |
| « J'ai testé à la main » | Non rejouable : ce n'est pas une preuve |
| « Le test passe déjà » | Il ne prouve rien tant qu'on ne l'a pas vu échouer : enquête |
| « Je simule cette classe interne » | Doublures seulement aux frontières d'I/O |

## Exceptions

Seulement avec l'accord explicite de l'utilisateur : prototype jetable (niveau 0), code généré, configuration pure.
