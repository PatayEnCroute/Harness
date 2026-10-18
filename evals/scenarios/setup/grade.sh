# Le projet est personnalisé : carte remplie, profil d'architecture, contrat vérifié par doctor.
set -e
! grep -q 'hx:todo' .harness/project.md
node -e "
  const c = require('./.harness/config.json');
  const comps = Object.values(c.components ?? {});
  if (!comps.some((x) => x.commands?.test)) throw new Error('aucune commande test');
  if (!c.architecture?.profile?.size || !c.architecture?.profile?.lifespan) throw new Error('profil absent');
"
node .harness/hx.mjs doctor
