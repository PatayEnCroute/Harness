# .harness

Installé par le template [Harness](https://github.com/PatayEnCroute/Harness). Mise à jour : `uvx copier update --trust`.

| Fichier | Nature | Rôle |
|---|---|---|
| `config.json` | **spécifique** (rempli par `/hx-setup`) | Contrat de commandes par composant, profil d'architecture, pistes |
| `project.md` | **spécifique** (rempli par `/hx-setup`) | Carte du projet, importée par `CLAUDE.md` |
| `hx.mjs` | générique | CLI `hx` (aucune dépendance) |
| `config.schema.json` | générique | Schéma du contrat (autocomplétion dans l'éditeur) |
| `versions.json` | générique | Version épinglée d'OpenSpec |

Les fichiers **spécifiques** ne sont jamais réécrits par `copier update`. Les fichiers **génériques** s'améliorent dans le repo Harness, pas ici.

```bash
node .harness/hx.mjs help
```
