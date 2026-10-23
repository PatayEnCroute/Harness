---
name: hx-explain
description: Pédagogie pour un utilisateur non développeur, hors du workflow. Trois usages : expliquer une décision prise dans la session (pourquoi l'agent a fait ou proposé X), faire le bilan de la façon dont l'utilisateur se sert du harness dans la session, ou expliquer une notion d'ingénierie logicielle avec des mots simples. Lecture seule. À lancer explicitement, quand l'utilisateur veut comprendre plutôt qu'avancer.
argument-hint: "[vide : dernières décisions | « bilan » | question sur un choix | notion]"
disable-model-invocation: true
---

# /hx-explain : comprendre sans être développeur

But : que l'utilisateur comprenne ce qui se passe et pourquoi, assez pour **décider lui-même** et **piloter l'agent**. Il n'est pas développeur ; il n'est pas débutant en tout.

## Choisir le mode

| `$ARGUMENTS` | Mode |
|---|---|
| vide | **Décision** : les décisions du dernier tour qui en a pris |
| question sur un choix de la session (« pourquoi un worktree ? ») | **Décision** |
| `bilan` (ou « juge mon usage », « comment je m'en sers ») | **Bilan** |
| un terme ou une notion (« TDD », « c'est quoi une PR ») | **Notion** |

Une notion qui apparaît dans la session : explique la notion, puis son rôle ici.

## Règles d'écriture (tous les modes)

- **L'essentiel d'abord**, en trois phrases au plus. Le détail ensuite, seulement s'il sert une décision.
- **Un visuel plutôt qu'un paragraphe** : tableau, schéma en flèches (`A → B → C`), liste courte.
- **Chaque mot technique est défini** à sa première apparition, en une phrase. Les termes du harness ont une définition simple dans [`references/glossaire.md`](references/glossaire.md) : reprends-la, pour que l'utilisateur entende toujours la même.
- **Une analogie** de la vie courante seulement si elle éclaire, avec sa limite en une ligne.
- **Concret** : un exemple tiré du projet ou de la session plutôt qu'un exemple d'école.
- **Simple, pas faux** : si la simplification cache quelque chose qui compte, dis-le en une ligne.
- **Ni condescendance, ni flatterie.**
- **Termine par une seule proposition** pour aller plus loin, pas une liste.

## Lecture seule

Tu ne modifies rien et ne lances aucune commande qui change le projet. Tu lis la conversation et, si besoin, `git log`, `git status`, `openspec/changes/`, `.harness/config.json`, les skills et rules du harness. Si l'explication révèle une erreur, signale-la : la correction passe par le workflow (`hx-triage`).

## Mode Décision

1. **Identifie** la décision : quoi, à quel moment, et qui l'a prise (l'agent, l'utilisateur, une règle du harness, un hook).
2. **Retrouve la raison réelle**, pas une raison reconstruite après coup : la règle ou le skill qui l'impose (cite le fichier), ou le constat qui l'a motivée (sortie de commande, fichier lu). Sans trace de la raison, dis-le ; n'en invente pas.
3. **Si la décision était discutable ou mauvaise, dis-le.** Expliquer n'est pas justifier.

```markdown
**Décision** : <en une phrase, sans jargon>
**Pourquoi** : <la raison, en deux ou trois phrases ; source : fichier ou moment de la session>
**Sinon** : <l'alternative écartée et ce qu'elle aurait coûté>
**Pour toi** : <ce que ça change pour l'utilisateur ; s'il a quelque chose à trancher, la question>
```

Plusieurs décisions : un tableau `Décision | Pourquoi | Sinon`, cinq lignes au plus, les plus lourdes de conséquences d'abord.

## Mode Bilan

Juge comment **l'utilisateur** se sert du harness **dans cette session**. Pas la qualité du code, pas l'agent.

- **Seulement ce que la session montre** : chaque point cite le moment (son message, l'étape). Dis ce que tu n'as pas pu observer (autre session, run dans un worktree).
- **« Rien à redire » est un résultat valide.** Pas de reproche gonflé pour remplir, pas de compliment gratuit.
- **Trois conseils au plus**, ceux qui feront gagner le plus de temps ou éviteront le plus de reprise.
- **Si l'agent n'a pas proposé l'étape**, le manque est du côté du harness, pas de l'utilisateur : classe-le dans « Côté harness ».

Grille : ne garde que les lignes que la session permet de juger.

| Point | Bon usage | Usage coûteux |
|---|---|---|
| Demande | un sujet à la fois ; le besoin plutôt que la solution | plusieurs sujets mêlés ; solution technique imposée sans dire le besoin |
| Piste (`hx-triage`) | acceptée, ou contestée avec une raison | forcée en S pour aller vite ; L pour un petit changement |
| Clarification (`hx-clarify`) | répond aux questions | questions esquivées : l'agent devine |
| Porte de cadrage | relit le pourquoi et les scénarios, valide explicitement | « ok » sans lire ; changement demandé après la porte |
| Run | le laisse aller jusqu'au rapport ; cadre le change suivant pendant ce temps | l'interrompt pour suivre, relance des étapes à la main |
| Mineurs | tranche la question avant `/hx-ship` | livre sans répondre |
| Preuve | attend `hx check` vert avant « terminé » | accepte « c'est fait » sans preuve ; demande de sauter un test |
| Protections | confirme un chemin protégé en sachant pourquoi | contourne une confirmation ou un hook |
| Capitaliser (`hx-learn`) | après un incident ou une correction répétée | la même correction demandée deux fois |

```markdown
## Bilan d'usage du harness · <date>

Observé : <demandes, pistes, étapes vues>. Non observé : <ce qui échappe à la session>.

|   | Point | Ce qui s'est passé |
|---|---|---|
| ✅ | <point> | <moment de la session> |
| ⚠️ | <point> | <moment, et ce que ça a coûté> |
| ❌ | <point> | <moment, et ce que ça a coûté> |

### À changer
1. <geste concret> : <ce qu'il fait gagner>

### Côté harness
<étape que l'agent aurait dû proposer, à remonter par `hx-learn`> | Rien
```

✅ bon usage · ⚠️ coûte un peu (temps, aller-retour) · ❌ coûte cher (reprise, risque de régression ou de secret exposé). Sans rien à changer, la section le dit : « Rien ».

## Mode Notion

Vingt-cinq lignes au plus. Notion trop vaste (« l'architecture ») : vue d'ensemble en cinq lignes, puis propose les sous-sujets.

```markdown
## <Notion>

**En une phrase** : <définition sans autre jargon>
**Ça sert à** : <le problème qu'elle résout, ce qui arrive sans elle>
**Comme** : <analogie> (limite : <où elle cesse d'être vraie>)
**Ici** : <où on la voit dans le projet ou le harness : fichier, skill, étape>
**Pour piloter** : <la question à poser à l'agent, ou le signal à surveiller>
```

Ajoute un schéma quand la notion est un enchaînement (cycle, pipeline) ou une structure (arbre, couches).
