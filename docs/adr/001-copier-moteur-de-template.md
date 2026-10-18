# ADR-001 : Copier comme moteur de template

- Statut : Accepté
- Date : 2026-10-17

## Besoin
Appliquer une même configuration de harness à des projets nouveaux **et existants**, puis propager ses améliorations sans écraser ce que chaque projet a personnalisé.

## Contexte
Usage solo, plusieurs projets aux stacks différentes, Claude Code y compris en session cloud (seuls les fichiers du dépôt y sont disponibles).

## Options
| Option | Coût | Rend plus facile | Rend plus difficile | Réversible ? |
|---|---|---|---|---|
| Ne rien changer (copier à la main) | nul | rien | les mises à jour, la cohérence | oui |
| Template GitHub | faible | créer un projet neuf | projet existant, mises à jour | oui |
| Script maison | moyen | contrôle total | mises à jour sans écraser (fusion à écrire) | oui |
| **Copier** | faible (Python via `uvx`, seulement à l'installation) | projet existant, mise à jour par fusion à 3 voies, versions par tags | dépendance à un outil Python | oui |

## Décision
Copier. Les fichiers propres au projet sont isolés (`_skip_if_exists`) pour que les mises à jour n'entrent jamais en conflit avec eux.

## Conséquences
- `uv` est requis à l'installation et à la mise à jour, pas à l'usage.
- Les versions du template sont des tags git ; `.copier-answers.yml` enregistre la version de chaque projet.
- Une modification locale d'un fichier générique peut entrer en conflit si le template change la même zone : le spécifique va dans `.harness/project.md` et `.harness/config.json`.

## Révision
Si Copier n'est plus maintenu, ou si la fusion à 3 voies produit des conflits répétés sur les fichiers génériques.
