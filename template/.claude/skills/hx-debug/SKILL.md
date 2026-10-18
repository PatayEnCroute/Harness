---
name: hx-debug
description: Débogage systématique. Reproduire par un test, isoler, prouver la cause racine, corriger au minimum, puis garder le test de non-régression. À utiliser pour un bug, une erreur, un test ou une CI en échec, ou un comportement inattendu dont la cause n'est pas évidente.
---

# hx-debug : pas de correctif sans cause prouvée

**Loi : pas de correction avant d'avoir reproduit le problème et identifié sa cause avec une preuve.**

## Étapes

1. **Reproduire** : écris un test qui échoue à cause du bug. Lance-le avec `node .harness/hx.mjs run test --file <test>` et vérifie qu'il échoue comme le bug. Si tu ne peux pas reproduire, ne corrige pas : rassemble des informations (logs, entrées, versions) et dis ce qui manque.
2. **Isoler** : réduis le cas au minimum. Utilise des journaux temporaires, des points d'arrêt, `git bisect` si c'est une régression. Change une seule variable à la fois.
3. **Cause racine** : formule une hypothèse et la prédiction qu'elle implique, puis vérifie la prédiction. Remonte les « pourquoi » jusqu'à la cause, pas jusqu'au symptôme. Écris-la en une phrase, avec sa preuve.
4. **Corriger** : le changement minimal qui traite la cause. Pas de refonte au passage.
5. **Vérifier** : le test de reproduction passe, et `hx-verify` est vert. Retire les journaux temporaires.
6. **Garder le test** : il reste comme test de non-régression. Tague-le `@scenario` s'il couvre un scénario de spec.

Si le bug révèle un comportement non spécifié ou mal spécifié, propose un change OpenSpec (piste M). Si la même classe de bug revient, propose `hx-learn`.

## Pièges

| Pensée | Réalité |
|---|---|
| « Je vois le problème, je corrige directement » | Sans reproduction, tu corriges une hypothèse |
| « J'essaie ce changement, on verra » | Une hypothèse, une prédiction, une vérification |
| « J'ajoute un try/catch » | Cacher le symptôme n'est pas traiter la cause |
| « Le test est flaky, je relance » | Un test instable est un bug : trouve sa source de non-déterminisme |
| « Trois correctifs ont échoué, j'en tente un quatrième » | Arrête-toi : l'hypothèse de départ est fausse, reviens à l'étape 2 |
