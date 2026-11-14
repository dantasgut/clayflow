# Quickstart — validar a 037

```sh
npm run ci                                        # tipos, lint, testes (inclui equivalência e assinaturas canônicas)
npm run smoke -- --headless                       # todos os smokes (comparar com baseline-smokes.md)
npm run build && npm run smoke -- --headless --dist
npm run smoke -- adapterLimits --headless         # grava os limites do adaptador (rodar também na RTX 4090)
npm run bench:check -- --headless                 # nenhuma cena > 10 % de GPU contra o baseline do Mac
```

O que conferir:

| Medida                       | Onde                                                                                                                                      | Critério |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Cobertura do inventário      | `inventory.md`: toda definição com destino e estado                                                                                       | SC-001   |
| Uma definição por primitiva  | teste de assinaturas canônicas + teste de símbolo único                                                                                   | SC-002   |
| Mesmos números               | smokes contra `baseline-smokes.md` (bit a bit onde já é; critérios atuais nos demais); tabela das diferenças por troca que muda resultado | SC-003   |
| Desempenho                   | `bench:check`; ganhos medidos em `research.md`                                                                                            | SC-004   |
| Tamanho do WGSL das famílias | contagem de linhas antes e depois, registrada no inventário                                                                               | SC-005   |
| Acumuladores                 | ≥ 3 de 4 usando as peças; smokes deles e custo                                                                                            | SC-006   |
| Precisão                     | tabela 16 × 32 bits por histórico (erro e custo)                                                                                          | SC-007   |
| Limites                      | fixtures `adapter-limits-*.json`; `deviceFloor` e cenas abrindo nas duas máquinas                                                         | SC-008   |
| Portão                       | `npm run ci` + smokes 3 vezes, fonte e `--dist`, zero erros de página                                                                     | SC-009   |

Antes de cada troca que muda resultado: rodar os smokes afetados, montar a tabela antes/depois e apresentar ao
usuário; fixture só regravada com a decisão dele.
