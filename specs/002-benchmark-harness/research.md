# Research — 002 Harness de Benchmark (Fase 0)

Decisões que resolvem as incógnitas do Technical Context. Formato: Decisão / Racional / Alternativas.

---

## R1 — Concorrente: Three.js com `WebGPURenderer`

- **Decisão**: `three@0.186.x` (fixado, sem `^`), importando de `three/webgpu`; `WebGPURenderer({ antialias: false,
trackTimestamp: true })` com `await renderer.init()`.
- **Racional**: mesma API gráfica do clayflow (WebGPU) — compara arquitetura de engine, não WebGL vs WebGPU.
  Versão fixada porque o renderer WebGPU do Three evolui rápido; a versão vai no perfil de cada execução.
- **Alternativas**: `WebGLRenderer` (comparação injusta e não informativa sobre a tese GPU-driven); Babylon.js
  (fora de escopo — pode entrar depois como novo adaptador).

## R2 — Física de referência no lado Three.js: Rapier

- **Decisão**: `@dimforge/rapier3d-compat@0.21.x` (WASM embutido, single-thread), passo fixo de 1/60 s.
- **Racional**: é a engine de corpos rígidos em JS/WASM de maior desempenho e a escolha atual do ecossistema
  Three.js (react-three-rapier). Comparar contra um adversário forte torna o resultado crível.
- **Alternativas**: `cannon-es` (JS puro, bem mais lento — adversário fraco); `ammo.js` (Bullet, API pesada,
  manutenção baixa); `@dimforge/rapier3d` não-compat (exige plugin WASM no Vite, sem ganho de medição).

## R3 — Automação do navegador: Playwright + Chrome instalado

- **Decisão**: `playwright` (só a lib, sem baixar browsers) com `chromium.launch({ channel: 'chrome' })`, **com
  janela** (headed) por padrão, flags `--enable-unsafe-webgpu --disable-gpu-vsync --disable-frame-rate-limit`;
  opção `--headless` para quem quiser.
- **Racional**: usa o Chrome real da máquina (Metal/D3D12/Vulkan reais — o que o usuário final tem). Sem vsync o
  FPS deixa de travar em 60/120 Hz e vira comparável. Headed evita diferenças de compositor/GPU do headless.
- **Alternativas**: Puppeteer (equivalente, mas Playwright tem melhor API de espera e de console); Chrome MCP
  (interativo, não reproduzível por comando); headless por padrão (risco de cair em SwiftShader/sem GPU).

## R4 — Servidor e isolamento

- **Decisão**: o runner sobe o Vite programaticamente (`createServer` com `bench/vite.config.ts`, root `bench/`) e
  abre **uma página nova por execução (cena × variante × engine × repetição)**. Comunicação página→runner por
  `window.__benchResult` + `page.waitForFunction` e logs de console.
- **Racional**: página nova zera estado (o clayflow usa o `defaultScene` singleton; o Three guarda caches).
  Fim do estado de uma cena contaminando a próxima (FR-001).
- **Alternativas**: trocar de cena na mesma página com dispose (risco de vazamento e de JIT/caches aquecidos
  favorecendo a segunda engine).

## R5 — Protocolo de medição

- **Decisão**: canvas fixo **1280×720**, `devicePixelRatio` forçado a 1; aquecimento **3 s** (descartado), janela
  **10 s**, **3 repetições**; tempo-limite **60 s** por execução. Modo `--quick`: 1 s / 3 s / 1 repetição.
  Valor reportado = **mediana das medianas** das repetições; dispersão = coeficiente de variação entre
  repetições; se CV > 5% a linha recebe aviso "instável".
- **Racional**: estimativa de duração do modo padrão: 9 variantes × 2 engines × 3 reps × ~13 s ≈ 12 min (< 15 min,
  SC-007); `--quick` ≈ 1,5–2 min (< 3 min). Mediana é robusta a hitches de GC/compilação. 5% < 10% de tolerância
  do gate (SC-002).
- **Alternativas**: média (sensível a outliers); número fixo de quadros (cenas lentas demorariam demais).
- **Ajustes da implementação (smoke real)**: o aquecimento exige também **5 quadros** além do tempo (no Three, a
  compilação de pipelines da cena de luzes caía dentro da janela); uma repetição que falha ou estoura o tempo
  decide a linha e as seguintes são puladas (economiza minutos sem mudar o resultado); o fechamento do
  navegador/servidor tem tempo-limite (uma aba que caiu por falta de memória pendurava o runner); o Vite do
  harness serve com COOP/COEP (isolamento cross-origin: `performance.now()` com resolução de µs — sem isso a
  CPU do Three aparecia como 0,00); `--quick` usa tempo-limite de 45 s (as cenas que o clayflow ainda não
  aguenta seguravam a rodada rápida em ~5 min); pares de timestamp com `last <= first` (não escritos — passe
  que não executou) são inválidos, para um quadro que falhou não aparecer como 0 ms de GPU.

## R6 — Métricas e como cada engine as fornece

| Métrica                                 | clayflow                                                                                                                                                                | Three.js                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **CPU/quadro**                          | `frameComplete.dt` — tempo síncrono do quadro, do envio dos dados alterados (`frameRecording`, spec 003) até `submit`; o início da medição é antecipado nesta spec (R7) | `performance.now()` em volta de `world.step()` (se houver física) + `renderer.render()` no loop do adaptador        |
| **GPU/quadro**                          | **novo**: soma dos intervalos de timestamp de todos os passes do quadro (FR-007a)                                                                                       | `renderer.resolveTimestampsAsync('render'/'compute')` + `renderer.info.render.timestamp` / `info.compute.timestamp` |
| **Intervalo de quadro → FPS, p95, p99** | `performance.now()` entre rAFs (medido pelo harness, igual nas duas)                                                                                                    | idem                                                                                                                |
| **Draw calls**                          | **novo**: contador por quadro no core (FR-007a)                                                                                                                         | `renderer.info.render.drawCalls`                                                                                    |
| **Memória GPU**                         | `core.memoryUsage().totalBytes` — já existe                                                                                                                             | estimada: soma de `byteLength` de atributos/índices + texturas (`info.memory` só dá contagens) — marcada "estimada" |

- **Racional**: CPU medido como "trabalho síncrono da engine no quadro" nas duas — inclui a física Rapier no
  Three (ela roda na CPU) e o encode da física GPU no clayflow; inclui também as mutações feitas pela cena em
  `update` (mover objetos) e, no clayflow, o envio desses dados no início do quadro. É exatamente o custo que um
  jogo paga.
- **Exceção declarada**: no clayflow a pose dos corpos rígidos volta da GPU por readback assíncrono e é publicada
  no `Transform` dentro do callback do mapeamento, fora do quadro síncrono (spec 003; some na F2). Esse trabalho
  não entra em `cpuMs`, só no intervalo de quadro (FPS/p95/p99), e a cena `rigid-bodies` o declara em
  `limitations`.
- **GPU sampling**: leituras de timestamp são assíncronas e nem todo quadro tem amostra (map em andamento); a
  métrica de GPU usa a mediana das amostras disponíveis na janela — mínimo de 30 amostras, ou um quarto dos
  quadros (ao menos 1) quando a cena é tão lenta que a janela tem poucos quadros; abaixo disso, "indisponível".
  Ao fim da janela a página espera até 1,5 s pela leitura ainda em trânsito (`EngineAdapter.gpuReading`).
- **Veredito do resumo**: compara o **custo efetivo por quadro** = maior entre intervalo médio, CPU e GPU. Sem
  vsync o laço do Three submete mais rápido do que a GPU termina (intervalo de 0,1 ms com 0,48 ms de GPU); o
  intervalo sozinho subestimaria o custo.

## R7 — Lacuna no motor: observabilidade de quadro (FR-007a)

- **Achado**: o `Profiler` atual só é usado pelo `ForwardFlow` (par fixo 0/1, opt-in) e o `DebugFlow` emite
  `profilerStats` com `stagesNs: {}` sempre vazio. Passes de compute (toda a física) não são medidos, e não há
  contador de draw calls. A spec exige API pública (FR-016) — o harness não pode acessar `core/gpu`.
- **Achado agravante (auditoria 2026-10-04)**: `createGpuContext` (`core/gpu/GpuContext.ts:17-19`) chama
  `adapter.requestDevice()` **sem `requiredFeatures`** — `timestamp-query` nunca é habilitado, então
  `GpuProfilerSystem.isSupported` é sempre `false` e nenhum timestamp é escrito, em nenhuma máquina.
- **Decisão**: nova capacidade genérica no motor:
  - `createGpuContext` passa a incluir `'timestamp-query'` em `requiredFeatures` **quando
    `adapter.features.has('timestamp-query')`** (sem custo quando não usado; sem a feature, segue como hoje).
    Mudança mínima e deliberada: `powerPreference`, demais features e limites e o relatório de capacidades são
    escopo da spec `004-core-hardening` (F1), que generaliza esta solicitação.
  - `ApplicationOptions.profiling?: boolean` (default `false`) → `core.setFrameProfiling(enabled)`.
  - C1 (`GpuFrame`/passes) conta `drawCalls`, `dispatches`, `passes` por quadro (contadores inteiros — custo
    desprezível, sempre ligados).
  - Com profiling ligado, **cada** passe render/compute sem `timestampWrites` explícito recebe automaticamente um
    par de timestamps de um alocador por quadro; capacidade do QuerySet configurável (default 256 = 128 passes);
    estouro → `gpuTimeMs` indisponível no quadro + aviso único.
  - `FrameCompleteEvent` ganha `stats: FrameStats` `{ drawCalls, dispatches, passes, gpuTimeMs? }`
    (`gpuTimeMs` = última leitura resolvida, com defasagem de 1–3 quadros, documentada).
  - `DebugFlow` passa a preencher `stagesNs` com os rótulos dos passes (corrige o vazio atual) — inclui o passe de
    compute `TransformFlow` (fase `transform`, spec 003), que só existe nos quadros com `Transform` alterado.
  - `ExecutionSystem` passa a medir `dt` a partir de **antes** de emitir `frameRecording` (hoje começa depois): o
    envio da fila de sujos da spec 003 é trabalho de CPU do quadro e precisa entrar na métrica.
  - Gravações auxiliares fora do quadro (ex.: `pool_grow:*`, cópia GPU→GPU quando um pool cresce, spec 003) têm
    contadores próprios e não sobrescrevem as estatísticas que o `ExecutionSystem` anexa ao `frameComplete`;
    como não abrem passes, não produzem leitura de GPU e não substituem a última leitura resolvida.
- **Racional**: é observabilidade que qualquer app precisa (perfil de jogo, overlay de debug) e que as fases
  F1+ vão exigir para provar "CPU constante". Cabe na Constituição: C1 conta/mede, C2 propaga via evento, C4 expõe
  opção — sem vazar tipos WebGPU (`FrameStats` é tipo de domínio simples).
- **Achado do primeiro smoke**: ~90% da CPU por quadro do clayflow vai para `specHash` (UUIDv5/SHA-1 sobre a spec
  serializada) recalculado a cada `setBindGroup`/`setPipeline` — o "cache do `specHash`" da spec 004 (F1).
  Revisão: o número de chamadas é multiplicado pelo `ForwardFlow`, que aloca buffers e bind groups por entidade
  (7 binds por draw, câmera regravada em cada entidade) em vez de consumir pelos slots o que a C2 já aloca — desvio
  da arquitetura de Flows, corrigido na 006 (F1). O cache é agravante; a causa principal é o Flow.
  Declarado pelo adaptador como limitação de toda cena clayflow; a 002 só mede.
- **Alternativas**: medir GPU por `queue.onSubmittedWorkDone()` (imprecisa com pipelining); contar draws no harness
  monkey-patching `GPURenderPassEncoder` (viola FR-016 e mede algo que o usuário não vê); pular métricas do
  clayflow (relatório pela metade — inaceitável).

## R8 — Equivalência das cenas e "melhor abordagem idiomática"

- **Decisão**: cada adaptador usa a **melhor abordagem pública idiomática** da sua engine para a mesma carga
  (ex.: no Three, 10k cópias = `InstancedMesh`, que é o que um usuário de Three faria). Conteúdo idêntico via
  gerador determinístico compartilhado (`mulberry32(seed)`) que produz posições/cores/escala para as duas engines.
- **Racional**: o benchmark mede "o que o usuário obtém" (FR-016). Forçar o Three a usar `Mesh` individual
  inflaria artificialmente a vantagem do clayflow.
- **Melhor caminho público atual do clayflow (FR-007b)**: as cenas clayflow usam o que a API pública já oferece de
  mais eficiente para cada carga (ex.: geometria e material compartilhados quando a fachada permitir; corpos
  rígidos pela fachada de domínio da spec 001), e declaram em `limitations` as limitações do motor que pesam no
  resultado (ex.: `rigid-bodies` → "readback de todos os corpos para a CPU por quadro"; `instances` → "sem
  instancing: 1 draw e 4 bind groups por objeto"; `instances/10k-moving` → "um envio por objeto alterado";
  ambas → "render LDR 8 bits, sem MSAA"). Isso torna o ganho da F1 e da F2 rastreável contra a linha de base.
- **Efeito da spec 003 sobre as cenas**: o `Transform` guarda só intenção e a matriz de mundo é calculada pelo
  `TransformFlow` em compute; o forward e a sombra leem a matriz pelo slot da entidade (`firstInstance`). Cena
  estática: nenhum envio e nenhum dispatch por quadro depois da montagem. Cena em movimento: a mutação de `data`
  entra numa fila e cada recurso alterado gera **um** `write` no início do quadro, seguido de um dispatch do
  `TransformFlow` — o agrupamento desses envios é ganho esperado da F2 (`007-gpu-scene-state`).
- **Estado esperado do clayflow hoje**: instâncias = N entidades (sem instancing no render) → 1M deve falhar ou
  estourar tempo; `10k-moving` mede N mutações + N envios por quadro; luzes = **não suportado** (o forward ignora `PointLight` até a F4 — inserir luzes que não
  iluminam não seria equivalente); personagens = **não suportado** até a F8. Tudo isso vira a linha de base.

## R9 — Personagem animado sem problema de licença

- **Decisão**: personagem **procedural** gerado em código no lado Three: malha humanoide simplificada (cápsulas
  fundidas, ~3k vértices), esqueleto de 20 ossos e um ciclo de caminhada sintético (`AnimationClip` com
  quaternions senoidais), 500 instâncias com `SkinnedMesh` + `AnimationMixer` e fase aleatória (seed).
- **Racional**: zero binário commitado, zero dúvida de licença, determinístico e com carga realista de skinning
  (o custo dominante é nº de ossos × vértices × personagens, não a beleza do modelo).
- **Alternativas**: amostras Khronos (Fox/CesiumMan têm atribuição CC-BY, exigiria NOTICE e binário no repo);
  Mixamo (não redistribuível — proibido pela spec).

## R10 — Perfil de ambiente e baselines

- **Decisão**: `profileId` = slug legível + hash curto de `{ adapter.info.vendor, architecture, device,
description, browser + versão maior, os, resolução }` (ex.: `apple-m2-chrome141-macos-1280x720-3fa9c1`).
  Baselines em `bench/baselines/<profileId>.json` (versionados); resultados brutos em `bench/results/`
  (gitignored) com `latest.json` + `latest.md`.
- **Racional**: só compara números da mesma máquina/navegador (spec US2-4). Versão menor do Chrome muda toda
  semana — usar só a maior evita invalidar baselines sem necessidade.

## R11 — Gate de regressão

- **Decisão**: `npm run bench:check` roda (ou lê `--from latest.json`) e compara com o baseline do perfil:
  reprova se qualquer métrica de **tempo do clayflow** (CPU mediana, GPU mediana, p95, p99 do intervalo) piorar
  > 10% (`--tolerance` configurável), ou se um resultado `ok` virar `failed`/`timeout`. Métricas "indisponível"
  > em qualquer lado são ignoradas com aviso. Three.js nunca reprova (FR-013). Melhorias > 10% são destacadas e o
  > comando sugere `npm run bench:baseline`.
- **Racional**: implementa FR-011–FR-014 e SC-003. A lógica de comparação é pura (CPU-side) → testada em Vitest
  (Princípio V), incluindo a "degradação artificial de 15%" do SC-003 como caso de teste sobre dados sintéticos.

## R12 — Isolamento do código do harness e gates do projeto

- **Decisão**: diretório `bench/` na raiz, fora de `src/`. O harness importa o clayflow **só pelo barrel público**
  (alias `clayflow` → `src/index.ts`), garantido por regra ESLint `no-restricted-imports` em `bench/**`.
  Ajustes de tooling: `lint` → `eslint src bench`; `format`/`format:check` incluem `bench/**`; Vitest inclui
  `bench/**/__tests__/**/*.test.ts`; `knip` ganha `bench/` como entry/projeto; `bench/tsconfig.json` próprio (tipos
  de `three` e `node`), checado em `npm run typecheck:bench` (incluído no gate local); `vite build` da lib não
  enxerga `bench/` (entry é `src/index.ts`, `dts` inclui só `src`). `three`, `@dimforge/rapier3d-compat`,
  `playwright`, `tsx` e `@types/three` entram como **devDependencies**.
- **Racional**: FR-017/FR-018 e SC-005 verificáveis: `npm pack --dry-run` não lista nada de `bench/` e
  `dependencies` continua só `uuid`.
