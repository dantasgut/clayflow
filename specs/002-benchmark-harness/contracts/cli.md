# Contrato — Comandos (CLI)

| Comando                             | Efeito                                                                       | Saída / código de saída                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run bench [-- flags]`          | Executa o catálogo (filtrado) e gera relatório                               | `bench/results/<data>-<profileId>.json`, `latest.json`, `latest.md`; exit 0 (exceto erro de ambiente) |
| `npm run bench:check [-- flags]`    | Executa (ou lê `--from`) e compara com `bench/baselines/<profileId>.json`    | exit 0 se `passed`; **exit 1** com lista de regressões; **exit 2** se não há baseline para o perfil   |
| `npm run bench:baseline [-- flags]` | Executa e grava/atualiza o baseline do perfil atual (só resultados clayflow) | `bench/baselines/<profileId>.json`; exit 0                                                            |
| `npm run typecheck:bench`           | `tsc -p bench/tsconfig.json --noEmit`                                        | exit ≠ 0 em erro de tipo                                                                              |

## Flags

| Flag                                                                | Default                  | Descrição                                                                                   |
| ------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `--scene <id[,id]>`                                                 | todas                    | filtra cenas                                                                                |
| `--variant <id[,id]>`                                               | todas                    | filtra variantes                                                                            |
| `--engine <clayflow\|three>`                                        | ambas                    | filtra engine                                                                               |
| `--quick`                                                           | off                      | aquecimento 1 s, janela 3 s, 1 repetição                                                    |
| `--warmup <ms>` / `--window <ms>` / `--reps <n>` / `--timeout <ms>` | 3000 / 10000 / 3 / 60000 | protocolo (R5)                                                                              |
| `--headless`                                                        | off                      | roda sem janela (pode cair em GPU de software — o runner avisa se o adaptador for software) |
| `--tolerance <0..1>`                                                | 0.10                     | tolerância do gate                                                                          |
| `--from <arquivo.json>`                                             | —                        | `bench:check` compara um resultado existente sem reexecutar                                 |
| `--port <n>`                                                        | 5180                     | porta do Vite do harness                                                                    |

## Erros de ambiente (exit 3, falha cedo)

- Chrome não encontrado → mensagem com instrução de instalação.
- WebGPU indisponível na página → "WebGPU indisponível neste navegador" (sem relatório parcial).
- Adaptador de software detectado (SwiftShader) → aviso; com `bench:check`/`bench:baseline` vira erro.
