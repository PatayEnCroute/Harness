---
paths:
  - "openspec/**"
---

# Écrire dans OpenSpec

- **Exigence** : `### Requirement: <nom>`, avec SHALL ou MUST. Elle décrit un comportement observable, sans détail d'implémentation, en moins de 500 caractères.
- **Scénario** : chaque exigence en a au moins un, `#### Scenario: <nom>` (quatre `#`). WHEN/THEN concrets, valeurs explicites, vérifiable par un test automatisé.
- **Traçabilité** : le nom d'un scénario devient son identifiant `<capability>/<slug du nom>`. Exemple : « Ajouter deux nombres » dans `specs/calc/` donne `calc/ajouter-deux-nombres`. Renommer un scénario casse les tags `@scenario` des tests : mets-les à jour dans le même change.
- **Nouvelle capability** : son delta commence par `## Purpose` (une phrase d'au moins 50 caractères), sinon l'archive laisse un texte provisoire qui fait échouer `validate --strict`.
- **Piste** : `.openspec.yaml` du change porte `x-track: M` ou `x-track: L`. Une piste S ne passe pas par OpenSpec.
- **Porte de cadrage** : `x-validated: AAAA-MM-JJ`, ajouté seulement après validation explicite de l'utilisateur (`hx-triage`). `hx-implement` ne démarre pas sans.
- **Piste L** : `design.md` commence par le besoin, indique le niveau d'architecture visé et cite son ADR (`docs/adr/NNN-titre.md`).
- **Specs principales** : `openspec/specs/` ne change que pendant `/opsx:sync` ou l'archive (`/hx-ship`). Écris les changements dans les delta specs du change.
- **Concision** : le moins d'exigences possible pour couvrir le besoin. Une spec se relit en deux minutes.
- **Valider** : `node .harness/hx.mjs openspec validate --all --strict`.
