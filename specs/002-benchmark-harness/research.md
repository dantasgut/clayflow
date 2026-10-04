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
- **Racional**: estimativa de duração do modo padrão: 7 variantes × 2 engines × 3 reps × ~13 s ≈ 9–10 min (< 15 min,
  SC-007); `--quick` ≈ 1,5–2 min (< 3 min). Mediana é robusta a hitches de GC/compilação. 5% < 10% de tolerância
  do gate (SC-002).
- **Alternativas**: média (sensível a outliers); número fixo de quadros (cenas lentas demorariam demais).

## R6 — Métricas e como cada engine as fornece

| Métrica                                 | clayflow                                                                              | Three.js                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **CPU/quadro**                          | `frameComplete.dt` (tempo síncrono de record+submit do `ExecutionSystem`) — já existe | `performance.now()` em volta de `world.step()` (se houver física) + `renderer.render()` no loop do adaptador        |
| **GPU/quadro**                          | **novo**: soma dos intervalos de timestamp de todos os passes do quadro (FR-007a)     | `renderer.resolveTimestampsAsync('render'/'compute')` + `renderer.info.render.timestamp` / `info.compute.timestamp` |
| **Intervalo de quadro → FPS, p95, p99** | `performance.now()` entre rAFs (medido pelo harness, igual nas duas)                  | idem                                                                                                                |
| **Draw calls**                          | **novo**: contador por quadro no core (FR-007a)                                       | `renderer.info.render.drawCalls`                                                                                    |
| **Memória GPU**                         | `core.memoryUsage().totalBytes` — já existe                                           | estimada: soma de `byteLength` de atributos/índices + texturas (`info.memory` só dá contagens) — marcada "estimada" |

- **Racional**: CPU medido como "trabalho síncrono da engine no quadro" nas duas — inclui a física Rapier no
  Three (ela roda na CPU) e o encode da física GPU no clayflow. É exatamente o custo que um jogo paga.
- **GPU sampling**: leituras de timestamp são assíncronas e nem todo quadro tem amostra (map em andamento); a
  métrica de GPU usa a mediana das amostras disponíveis na janela (mínimo 30 amostras, senão "indisponível").

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
    escopo da spec `003-core-foundations` (F0.5), que generaliza esta solicitação.
  - `ApplicationOptions.profiling?: boolean` (default `false`) → `core.setFrameProfiling(enabled)`.
  - C1 (`GpuFrame`/passes) conta `drawCalls`, `dispatches`, `passes` por quadro (contadores inteiros — custo
    desprezível, sempre ligados).
  - Com profiling ligado, **cada** passe render/compute sem `timestampWrites` explícito recebe automaticamente um
    par de timestamps de um alocador por quadro; capacidade do QuerySet configurável (default 256 = 128 passes);
    estouro → `gpuTimeMs` indisponível no quadro + aviso único.
  - `FrameCompleteEvent` ganha `stats: FrameStats` `{ drawCalls, dispatches, passes, gpuTimeMs? }`
    (`gpuTimeMs` = última leitura resolvida, com defasagem de 1–3 quadros, documentada).
  - `DebugFlow` passa a preencher `stagesNs` com os rótulos dos passes (corrige o vazio atual).
- **Racional**: é observabilidade que qualquer app precisa (perfil de jogo, overlay de debug) e que as fases
  F1+ vão exigir para provar "CPU constante". Cabe na Constituição: C1 conta/mede, C2 propaga via evento, C4 expõe
  opção — sem vazar tipos WebGPU (`FrameStats` é tipo de domínio simples).
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
  instancing: 1 draw + 3 uploads por objeto"; ambas → "render LDR 8 bits, sem MSAA"). Isso torna o ganho da F0.5
  e da F1 rastreável contra a linha de base.
- **Estado esperado do clayflow hoje**: instâncias = N entidades (sem instancing no render) → 1M deve falhar ou
  estourar tempo; luzes = **não suportado** (o forward ignora `PointLight` até a F3 — inserir luzes que não
  iluminam não seria equivalente); personagens = **não suportado** até a F4. Tudo isso vira a linha de base.

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
