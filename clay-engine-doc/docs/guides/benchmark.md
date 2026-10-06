# Benchmark clayflow × Three.js

O harness em `bench/` mede o clayflow contra o Three.js (`WebGPURenderer`, + Rapier na física) com cenas
genéricas idênticas, no Chrome real da máquina. Serve de critério de aceite das fases do roadmap: medir antes
de otimizar e impedir regressões silenciosas. Fica fora da lib — nada de `bench/` entra no pacote publicado.

## Pré-requisitos

- Google Chrome (ou Edge) instalado, com WebGPU. O Playwright usa o Chrome da máquina (`channel: 'chrome'`)
  e não baixa navegadores.
- `npm install` (instala `three`, `@dimforge/rapier3d-compat`, `playwright` e `tsx` como devDependencies).
- Feche abas e apps pesados e deixe o notebook na tomada: throttling térmico vira ruído.

## Rodar

```bash
npm run bench -- --quick                     # 1 s aquecimento, 3 s janela, 1 repetição, limite 45 s
npm run bench                                # protocolo completo: 3 s, 10 s, 3 repetições
npm run bench -- --scene instances --engine clayflow --variant 10k,10k-moving
```

O runner sobe o Vite (`bench/vite.config.ts`, porta 5180), abre o Chrome com janela, sem vsync e sem limite
de quadros, e roda cada cena × variante × engine × repetição numa **página nova**. Grava
`bench/results/latest.json` (dados) e `latest.md` (tabela), mais um histórico datado (gitignored).

| Flag                                                     | Default             | Efeito                                                  |
| -------------------------------------------------------- | ------------------- | ------------------------------------------------------- |
| `--scene`, `--variant`, `--engine`                       | todas               | filtros (listas separadas por vírgula)                  |
| `--quick`                                                | off                 | aquecimento 1 s, janela 3 s, 1 repetição, limite 45 s   |
| `--warmup` / `--window` / `--reps` / `--timeout`         | 3000/10000/3/60000  | protocolo                                               |
| `--headless`                                             | off                 | sem janela (pode cair em GPU de software — o runner avisa) |
| `--tolerance`                                            | 0.10                | tolerância do gate                                      |
| `--from <arquivo>`                                       | —                   | `bench:check` sobre um resultado já gravado             |
| `--no-profiling`                                         | off                 | desliga o profiling de GPU do clayflow (mede o overhead) |
| `--port`                                                 | 5180                | porta do Vite do harness                                |

Uma repetição que falha ou estoura o tempo decide a linha; as repetições seguintes daquela linha são puladas.

## Ler o relatório

Uma linha por cena × variante, com `clay / three / ×` para CPU e GPU por quadro e `clay / three` para FPS,
p99, draw calls e memória.

- `×` = clayflow ÷ Three — acima de 1, o clayflow é mais lento.
- `n/d` = métrica indisponível (ex.: sem `timestamp-query`, ou menos de 30 leituras de GPU na janela) — nunca 0.
- `*` = memória estimada (Three: soma de atributos, índices e texturas; o clayflow informa a memória exata).
- ⚠ = instável: coeficiente de variação acima de 5% entre repetições.
- "limitado pela vsync" = FPS a ±2% de 60/120/144 — compare CPU e GPU por quadro.
- **Resumo**: mais rápido / equivalente (±10%) / mais lento, pelo tempo médio de quadro.
- **Limitações conhecidas do motor**: o que o clayflow ainda não faz e pesa no número (FR-007b), com a fase
  do roadmap que resolve. O benchmark mede o motor como ele é — cada fase mostra o ganho contra essa linha de base.

Como cada engine mede:

| Métrica      | clayflow                                                                      | Three.js                                       |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| CPU/quadro   | `update` da cena + `frameComplete.dt` (envio dos dados alterados → `submit`)   | `performance.now()` em volta de `update` + `render` |
| GPU/quadro   | `frameComplete.stats.gpuTimeMs` (todos os passes, defasagem de 1–3 quadros)   | `resolveTimestampsAsync('render')`             |
| Draw calls   | `frameComplete.stats.drawCalls`                                               | `renderer.info.render.drawCalls`               |
| Memória      | `core.memoryUsage().totalBytes` (exata)                                       | estimada                                       |
| Quadro/FPS   | intervalo entre `requestAnimationFrame` (igual nas duas)                      | idem                                           |

No clayflow, a pose dos corpos rígidos volta da GPU por readback assíncrono e é publicada fora do quadro
síncrono; esse trabalho aparece só no intervalo de quadro (até a F2).

## Baseline e gate local

```bash
npm run bench:baseline                         # grava bench/baselines/<perfil>.json (só clayflow)
git add bench/baselines/ && git commit -m "perf(bench): baseline <perfil>"
npm run bench:check                            # executa e compara com o baseline do perfil
npm run bench:check -- --from bench/results/latest.json   # compara sem reexecutar
```

- O perfil (`profileId`) identifica GPU, navegador (versão maior), SO e resolução: números de máquinas
  diferentes nunca são comparados. Sem baseline para o perfil, o `check` sai com código 2 e lista os perfis
  existentes.
- Reprova (código 1) quando CPU, GPU, p95 ou p99 do clayflow piora mais que a tolerância, ou quando uma linha
  que funcionava passa a falhar. Melhorias acima da tolerância são destacadas, com a sugestão de atualizar o
  baseline. O Three.js é referência e nunca reprova.
- Erros de ambiente (Chrome ausente, WebGPU indisponível, adaptador de software no `check`/`baseline`) saem
  com código 3.
- O CI não tem GPU: o benchmark faz parte do **gate local** de mudanças em renderização e física (ver
  [Dev workflow](./dev_workflow.md)).

## Adicionar uma cena

1. Crie `bench/scenes/<id>/scene.ts` com a `SceneDefinition`: id kebab-case, título, descrição, fase do roadmap,
   semente, câmera e variantes (`params`).
2. Crie `clayflow.ts` e `three.ts` com `export default` de uma `SceneImplementation` (`setup`, `update?`,
   `limitations?`) — ou declare `{ unsupported: 'motivo', until: 'F5' }` para a engine que ainda não suporta.
3. Registre a definição em `CATALOG` (`bench/core/catalog.ts`). Executor, métricas, relatório e baseline já a
   incluem; `validateCatalog` aponta erros de declaração.

Regras: conteúdo só a partir de `rng` (`mulberry32(seed)`) e `variant.params` — os geradores `gridScatter` e
`motionAt` de `bench/core/rng.ts` dão o mesmo conteúdo e o mesmo movimento às duas engines. O lado clayflow
importa apenas de `clayflow` (barrel público; o ESLint bloqueia `src/**`). Mover um objeto no clayflow é escrever
em `transform.data` — sem matriz montada na cena nem `emit` manual.

## Observabilidade do motor na sua app

O harness usa uma capacidade genérica do motor, útil a qualquer aplicação (overlay de debug, perfil de jogo):

```ts
const app = await Application.create({ canvas, profiling: true });
app.events.on('frameComplete', ({ dt, stats }) => {
  console.log(
    `CPU ${dt.toFixed(2)} ms · GPU ${stats.gpuTimeMs?.toFixed(2) ?? 'n/d'} ms · ` +
      `${stats.drawCalls} draws · ${stats.dispatches} dispatches · ${stats.passes} passes`,
  );
});
```

- `stats.drawCalls`, `dispatches` e `passes` estão sempre disponíveis (contadores inteiros).
- `profiling: true` dá timestamps a todo passe; `stats.gpuTimeMs` chega com 1–3 quadros de defasagem
  (`stats.gpuFrame` diz a que quadro pertence) e `stats.stagesNs` traz o tempo por rótulo de passe, que o
  `DebugFlow` repassa em `profilerStats.stagesNs`.
- Capacidade: `profilingCapacity` (default 256 timestamps = 128 passes por quadro). Se um quadro tiver mais
  passes, `gpuTimeMs` fica ausente nele e o console avisa uma vez.
- Sem a feature `timestamp-query` no device, o motor avisa uma vez e segue sem tempo de GPU.
