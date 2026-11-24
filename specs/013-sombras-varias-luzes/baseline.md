# Estado de partida da 013

`develop` 9b01c88b (com a 011 e as correções de sombra do #54), 2026-11-24, Apple M4, Chrome headless.

## Rodado

- `tsc`, `lint` (0 erros), `format:check` e o Vitest (2377 testes) verdes no fechamento do #54.
- Smoke `lighting` inteiro: passa.
  - `penumbra`: θ 0,00466 → 1,8 %; θ 0,02 → 12,3 % (limite 15 %); θ 0,05 → 1,6 %; borda dura 2,89 mm.
  - `sun-travel`: 0,0000 % nos casos de 0,36° e 0,02° por quadro; 0,0018 % e 0,0123 % nos de 0,002° (origem e longe).
- Smokes `nodeGraphs` e `materials` (`subsuperficie`, `madeira-pinho`, `madeira-macica`): passam (rodados no #54).

## Não rodado

`sky`, `clouds`, `fog`, `globalIllumination`, `refraction`, `parametricSurfaces`, `antialiasing`, `render`, `rayScene` e o
`materials` inteiro: a execução foi barrada pelo modo de permissão da sessão (2026-11-24, duas tentativas). Continuam
sem resultado depois do #54. Ficam para a bateria de fechamento (T049), com autorização do usuário.

## Por medir

- O tempo de GPU da sombra numa cena de uma luz, parada e girando (o `sun-travel` não imprime o tempo): entra com o
  caso `shadow-timing` (T045), medido antes de a fase 2 mudar o caminho.
- A contagem de buffers de storage por estágio do forward (T002).
