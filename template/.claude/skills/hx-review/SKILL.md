---
name: hx-review
description: Fait relire un changement par des sous-agents indépendants (conformité à la spec, qualité et architecture, sécurité si pertinent), vérifie chaque constat pour écarter les faux positifs, puis consolide. À utiliser après hx-verify et avant de livrer, ou à la demande sur une branche.
argument-hint: "[branche de base, par défaut main]"
---

# hx-review : relecture indépendante

Celui qui a écrit le code ne le juge pas. Les relecteurs n'ont pas ton contexte : c'est voulu.

## Étapes

1. **Périmètre** : base = `$ARGUMENTS`, sinon `main`. Lance `git diff <base>...HEAD --stat` et identifie le change OpenSpec concerné.
2. **En parallèle** :
   - `hx-spec-reviewer`, si un change OpenSpec est concerné ;
   - `hx-code-reviewer`, toujours ;
   - `hx-security-reviewer`, si le diff touche des entrées externes, l'authentification, des données personnelles, des secrets, des dépendances, la CI ou l'infrastructure.
3. **Filtre** : pour chaque constat bloquant ou important, va lire la ligne citée et confirme-le toi-même. Écarte ce que tu ne peux pas confirmer, avec une raison d'une ligne.
4. **Corrige** les constats bloquants confirmés, en TDD (`hx-tdd`), puis relance `hx-verify`.
5. **Mineurs** : propose-les à l'utilisateur, ne les corrige pas sans son accord.

## Rapport

| Gravité | Fichier:ligne | Constat | Suite (corrigé, proposé, écarté et pourquoi) |
|---|---|---|---|

Verdict final : `Prêt à livrer` ou `Bloqué : …`.
