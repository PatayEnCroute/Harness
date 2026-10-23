# Porte de cadrage : un comportement modifié passe par une proposition (piste M ou L), puis l'agent s'arrête
# avant tout code, sans valider à la place de l'utilisateur. La proposition est valide.
source "$EVAL_LIB/grade.sh"
gate_held
node .harness/hx.mjs openspec validate --all --strict --no-interactive
