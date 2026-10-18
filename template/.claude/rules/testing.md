---
paths:
  - "**/test/**"
  - "**/tests/**"
  - "**/__tests__/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/*_test.go"
  - "**/*Test.cs"
  - "**/*Tests.cs"
  - "**/*Test.java"
  - "**/*Tests.java"
  - "**/*Test.kt"
---

# Écrire des tests

- **Test d'abord** : le test échoue pour la bonne raison avant que le code existe. Exceptions : un test de caractérisation sur du code existant (refactor, `hx-discover`), qui passe tout de suite ; et, avec l'accord explicite de l'utilisateur, celles de `hx-tdd` (prototype jetable, code généré, configuration pure).
- **Un comportement par test** : son nom décrit ce comportement, pas la méthode testée.
- **Traçabilité** : un test qui couvre un scénario OpenSpec porte le tag `@scenario <capability>/<scénario>`, dans son nom ou en commentaire juste au-dessus. Exemple : `// @scenario calc/ajouter-deux-nombres`. `node .harness/hx.mjs trace` vérifie la correspondance.
- **Doublures aux frontières seulement** : on simule les I/O externes (réseau, horloge, prestataires), jamais le code qu'on possède.
- **Déterministe** : pas de `sleep`, pas d'ordre implicite entre tests, pas de dépendance au réseau réel.
- **Lancer un seul fichier** : `node .harness/hx.mjs run test --file <chemin>`.
- **Ne jamais affaiblir un test** pour le faire passer (assertion retirée, `skip`, tolérance élargie) sans l'accord explicite de l'utilisateur.
