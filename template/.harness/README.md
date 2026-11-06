# .harness

Installé par le template [Harness](https://github.com/PatayEnCroute/Harness). Mise à jour : dis « mets à jour le harness » (`/hx-update`).

| Fichier | Nature | Rôle |
|---|---|---|
| `config.json` | **spécifique** (rempli par `/hx-setup`) | Contrat de commandes par composant, profil d'architecture, pistes, seuil de `trace`, livraison automatique (`ship`) |
| `project.md` | **spécifique** (rempli par `/hx-setup`) | Carte du projet, importée par `CLAUDE.md` |
| `ci/setup/action.yml` | **spécifique** (rempli par `/hx-setup`) | Outillage de la stack pour le workflow `hx-check` |
| `hx.mjs` | générique | CLI `hx` (aucune dépendance) |
| `hooks.mjs` | générique | Hooks Claude Code (câblés dans `.claude/settings.json`) |
| `config.schema.json` | générique | Schéma du contrat (autocomplétion dans l'éditeur) |
| `versions.json` | générique | Version épinglée d'OpenSpec |

Les fichiers **spécifiques** ne sont jamais réécrits par `copier update`. Les fichiers **génériques** s'améliorent dans le repo Harness, pas ici.

```bash
node .harness/hx.mjs help
```
