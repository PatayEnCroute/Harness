---
name: hx-adr
description: Rédige un ADR « besoin d'abord » dans docs/adr/. À utiliser pour une décision difficilement réversible ou de piste L, comme un schéma de données, un contrat d'API publique, un découpage en modules ou en services, ou un changement de niveau d'architecture.
argument-hint: "[sujet de la décision]"
---

# hx-adr : une décision, une page

## Étapes

1. Si l'analyse n'existe pas encore, lance **`hx-architect`** avec le sujet (`$ARGUMENTS`).
2. **Numéro** : le prochain `NNN` dans `docs/adr/` (`001` si le dossier est vide). Fichier : `docs/adr/NNN-titre-en-kebab-case.md`.
3. Remplis le gabarit ci-dessous, sur **une page au plus**.
4. **Statut** : `Proposé`. Il ne passe à `Accepté` qu'après validation explicite de l'utilisateur.
5. **Lien** : cite le fichier de l'ADR dans le `design.md` du change. Pour la piste L, `hx check` exige ce lien.
6. Une fois l'ADR accepté, si la décision change le niveau d'une feature, mets à jour `architecture.features` dans `.harness/config.json`.

## Gabarit

```markdown
# ADR-NNN : <décision>

- Statut : Proposé
- Date : AAAA-MM-JJ

## Besoin
Quel problème, pour qui, quel attribut qualité visé.

## Contexte
Taille du projet, niveau d'architecture actuel de la feature, contraintes.

## Options
| Option | Coût | Rend plus facile | Rend plus difficile | Réversible ? |
|---|---|---|---|---|
| Ne rien changer | | | | |
| Option la plus simple | | | | |

## Décision
Le minimum qui couvre le besoin, et le niveau visé par feature.

## Conséquences
Ce qui change pour le code, les tests et l'exploitation.

## Révision
Signal observable qui rouvrira la décision.
```

## Règles

- Le besoin vient en premier. Sans besoin, pas d'ADR : la bonne décision est de ne rien ajouter.
- L'option « ne rien changer » est toujours présente.
- Un ADR accepté n'est jamais réécrit. On en crée un nouveau qui le remplace.
