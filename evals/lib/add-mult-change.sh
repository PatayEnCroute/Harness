# Prépare un change OpenSpec de piste M (multiplication) dans le projet courant.
node .harness/hx.mjs openspec new change add-mult > /dev/null 2>&1
change=openspec/changes/add-mult
echo 'x-track: M' >> "$change/.openspec.yaml"
cat > "$change/proposal.md" <<'MD'
## Why
Need multiplication to compute invoice line totals.

## What Changes
- Add a multiplication function `mult(a, b)` in `src/mult.js`

## Capabilities

### New Capabilities
- `calc`: arithmetic used by invoices

### Modified Capabilities

## Impact
src/mult.js
MD
mkdir -p "$change/specs/calc"
cat > "$change/specs/calc/spec.md" <<'MD'
## Purpose
Arithmetic operations used to compute invoice lines and totals.

## ADDED Requirements

### Requirement: Multiplication
The system SHALL multiply two integers with `mult(a, b)` exported by `src/mult.js`.

#### Scenario: Multiply two numbers
- **WHEN** multiplying 2 and 3
- **THEN** the result is 6

#### Scenario: Multiply by zero
- **WHEN** multiplying 7 and 0
- **THEN** the result is 0
MD
printf '## 1. Multiplication\n\n- [ ] 1.1 Write the tests for both scenarios\n- [ ] 1.2 Implement mult in src/mult.js\n' > "$change/tasks.md"
