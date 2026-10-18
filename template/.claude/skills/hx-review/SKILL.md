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
3. **Filtre** : les trois relecteurs emploient la même échelle (`bloquant`, `important`, `mineur`). Pour chaque constat bloquant ou important, va lire la ligne citée et confirme-le toi-même. Écarte ce que tu ne peux pas confirmer, avec une raison d'une ligne.
4. **Corrige** les constats bloquants confirmés, en TDD (`hx-tdd`), puis relance `hx-verify`.
5. **Mineurs** : ne les corrige pas sans l'accord de l'utilisateur, et ne lui pose pas la question en cours de run. Liste-les dans le rapport.

## Rapport de fin de run

C'est le dernier message du run : l'utilisateur doit pouvoir décider en quelques minutes, sans relire la conversation.

```markdown
## <change> : Prêt à livrer | Bloqué : <raison en une ligne>

Piste X · branche <branche> · tâches N/N · <n> commits

### Vérification
hx check : <vert, ou étapes rouges> · trace : <scénarios couverts>

### Hypothèses à confirmer
- <choix que la spec ne tranchait pas> → <option retenue> (<fichier>)

### Revue
| Gravité | Fichier:ligne | Constat | Suite (corrigé, proposé, écarté et pourquoi) |
|---|---|---|---|

### Mineurs proposés (non appliqués)
- …

### Prochaine étape
/hx-ship <change>, ou ce qu'il faut trancher
```

Les sections vides restent, avec « Aucune » : une absence de constat est aussi une information.
