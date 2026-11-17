---
description: 'Tarefas da spec 038 — motor puro e o app clayflow-web'
---

# Tasks: Motor puro e o app clayflow-web

**Input**: Design documents from `/specs/038-motor-puro-web/`

**Prerequisites**: plan.md, spec.md, research.md (R1–R10), data-model.md, contracts/entry-points.md, quickstart.md

**Tests**: pedidos pela spec (FR-008, FR-011, SC-002–SC-005) e pela constituição (V): testes de unidade dos contratos
novos, smokes de imagem iguais, testes no Deno.

**Organization**: por história. A fundação (contratos, ponto de entrada web, pacote) bloqueia todas; o app (US2) vem
antes da limpeza do motor (US1), porque as cenas precisam chegar ao app antes de sair do motor.

Caminhos: `clayflow/` é o motor (este repositório); `claflow-web/` é o app (`geom-diff-calc/claflow-web`, sem
renomear).

## Reconciliação (2026-11-12, 034 T071)

As 23 caixas abertas foram conferidas contra o motor e o app (`claflow-web`, branch `feature/034-luz-global-tanque`,
que contém a `feature/038-motor-puro-web` dele). Cada uma traz a nota **Reconciliação** com o registro e o arquivo:

- **Feitas, marcadas com a evidência (6)**: T021–T026 — o app com o catálogo das cenas, a página da cena, o gravador
  pelo Chrome (`3586df0` no app), com as diferenças anotadas (catálogo num arquivo só; `tsconfig` sem `paths`).
- **Abertas (17)**: T027 e T029 no app (a `agua` interativa completa, o README); a limpeza do motor (T030–T033: o
  gravador antigo e `videoScenes.ts` ainda no motor); o Deno no motor (T035, T037, T038, T042); os guias (T036, T046);
  o gravador pelo Deno para o catálogo e a gravação enviada (T043, T044); a janela nativa conferida (T045); o JSDoc e
  o gate (T047, T048). Seguem nesta spec.

## Conferência (2026-11-17)

As 17 caixas abertas conferidas de novo contra o `origin/develop` do motor (`2fd2429e`) e o `claflow-web` (`master`,
`feature/038-motor-puro-web`, `feature/039-tracado-em-ondas`, `feature/034-luz-global-tanque` e a ponta
`feature/041-nuvens-volumetricas`, `8bab445`). Nenhuma estava entregue sem marcar; cada uma traz a nota
**Conferência** com a situação: (c) parcial ou (d) não entregue.

- **Parciais (8)**: T027, T036, T037, T042, T043, T045, T046, T047 — e o que falta em cada uma.
- **Não entregues (9)**: T029, T030–T033, T035, T038, T044, T048.

Ficam 17 abertas.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: a história (US1–US4)

---

## Phase 1: Setup — a linha de base

**Purpose**: o que a spec compara no fim (R9, FR-011)

- [x] T001 Anotar a referência de regressão em `specs/038-motor-puro-web/baseline.md`: contagem dos testes (`npm test`), `tsc`, lint, e para cada smoke a situação e os números no início (rodar todos com `--headless`, timeout generoso; os que já falhavam anotados como falhando, com as mesmas mensagens)
- [x] T002 Gravar pelo motor, duas vezes, os 60 primeiros quadros de cada cena de `src/__smokes__/videoScenes.ts` em FFV1 sem perda (`npm run video -- <cena> --frames 60 --lossless`), guardar os vídeos fora do repositório e, em `specs/038-motor-puro-web/baseline/`, o `framemd5` e o PSNR por quadro entre as duas gravações (a variação da linha de base, R9); `ondulacao`, `nevoa` e `natureza` não montam hoje (limite da GI e a névoa com as cáusticas, da 034) e ficam sem linha de base
- [x] T003 [P] Registrar no `claflow-web` o estado de partida: `git status`, branch `master` limpa, criar a branch `feature/038-motor-puro-web` nele

---

## Phase 2: Foundational — contratos, superfícies e o ponto de entrada web

**Purpose**: o núcleo sem o navegador e o `clayflow/web` com o comportamento de hoje (bloqueia US1–US4)

### Testes primeiro

- [x] T004 [P] Testes de unidade de `PresentationSurface` (contrato e `TextureSurface` com o núcleo de teste) em `src/core/gpu/surfaces/__tests__/TextureSurface.test.ts`: tamanho, formato, `currentTexture`, `read` pela cópia para staging, `onResize` só por pedido
- [x] T005 [P] Testes do `WebPlatformAdapter` em `src/platform/web/__tests__/WebPlatformAdapter.test.ts` (o `navigator.gpu` e o canvas falsos): o `configure` com o formato preferido ou `rgba16float`, o `ResizeObserver` (e `window.resize` sem ele) com o debounce de 100 ms de hoje
- [x] T006 [P] Testes do agendador do laço (`FrameScheduler`: o `GameLoop` agenda e cancela por ele; sem ele, `start` lança e `step` funciona) em `src/presentation/app/__tests__/GameLoop.scheduler.test.ts`
- [x] T007 [P] Testes dos dispositivos de entrada (`InputDevice`: o `InteractionSystem` liga e desliga os que recebe; os do DOM nos testes de `Input` existentes) em `src/presentation/input/__tests__/InteractionSystem.devices.test.ts`

### Implementação

- [x] T008 Contratos `PlatformAdapter` e `PresentationSurface` em `src/core/contracts/PlatformAdapter.ts` (data-model; padrão adapter, decisão do usuário: o núcleo obtém o adaptador da GPU e o contexto só por ele) e reexport de tipo em `src/scene/contracts/gpu.ts`
- [x] T009 `WebPlatformAdapter` em `src/platform/web/WebPlatformAdapter.ts` (`navigator.gpu.requestAdapter`, `getPreferredCanvasFormat`, `canvas.getContext('webgpu')` como `PresentationSurface`); `GpuContext.ts`, `GpuEngineCore.ts`, `EngineCore.ts`, `SceneContext.ts` e `scene/index.ts` passam a receber o `PlatformAdapter` e o alvo de apresentação em vez de `HTMLCanvasElement` e de `navigator.gpu`
- [x] T010 `TextureSurface` em `src/core/gpu/surfaces/TextureSurface.ts` (a textura alvo do tamanho e formato pedidos; `read` por cópia para staging)
- [x] T011 `FrameScheduler` (contrato) em `src/presentation/app/FrameScheduler.ts`; `GameLoop.ts` sobre ele (o laço manual continua sendo o `step()`)
- [x] T012 `InputDevice` (contrato) em `src/presentation/input/InputDevice.ts`; o `InteractionSystem` e o `sceneInteraction` recebem os dispositivos do ponto de entrada; os do DOM (`KeyboardDevice`, `PointerDevice`, `TouchDevice`, `GamepadDevice`), o `FpsController` (pointer lock) e o `UiInteractionHandler` em `src/platform/web/`; o teclado do `DebugFlow` pelo evento `keyDown` do barramento; os gamepads pelo `GamepadSource` do `Input`, registrado pelo `GamepadDevice` do web
- [x] T013 `Engine` em `src/presentation/app/Engine.ts`: o miolo do `Application` (cena, sistemas, passo, `whenReady`, `readyForFrame`, profiling, eventos) sobre `PresentationSurface` + `FrameClock` + `InputSource`, sem DOM
- [x] T014 Ponto de entrada web em `src/platform/web/`: `Application` (as opções de hoje; compõe `Engine` com `CanvasSurface`, `AnimationFrameClock`, a entrada DOM), `AnimationFrameClock`, `DomInputSource`, e os módulos do navegador movidos para cá (`FontLoader`, `HeightmapLoader`, a rasterização da UI do `UiGpuPipeline` por `OffscreenCanvas`); `src/platform/web/index.ts` reexporta o núcleo e o que é do web
- [x] T015 Núcleo em `src/index.ts` sem `Application` nem os módulos do navegador; `src/presentation/index.ts` ajustado
- [x] T016 Pacote: `package.json` com `name: "clayflow"` e `exports` `.`, `./web`, `./deno` (contracts/entry-points.md); `vite.config.ts` com as três entradas (`src/index.ts`, `src/platform/web/index.ts`, `src/platform/deno/index.ts` — este ainda só com o núcleo e a `TextureSurface`) e os `.d.ts`; o alias `clayflow` do bench e do Vitest
- [x] T017 Os smokes, o bench (`bench/page/*.ts`, `bench/engines/clayflow.ts`) e os testes que usam `Application` passam a importar de `clayflow/web`
- [x] T018 Regra de camadas no lint (`eslint.config.js`): `src/platform/**` com as mesmas restrições da C4; `madge` sem ciclos
- [x] T019 Verificação da fundação: `npm test`, `tsc`, lint, `npm run build:lib` (três entradas no `dist/`), e os smokes da linha de base (T001) com os mesmos números e imagens

**Checkpoint**: o motor roda no navegador pelo `clayflow/web` como antes; o núcleo não usa o canvas.

---

## Phase 3: User Story 2 — o app clayflow-web com as cenas (P1)

**Goal**: as cenas de vídeo e o gravador no app; as cenas antigas fora; o app no motor atual

**Independent Test**: no app, cada cena migrada abre e grava os mesmos 60 quadros da linha de base (T002)

- [x] T020 [US2] Sem renomeação (decisão do usuário de 2026-10-28: nada é renomeado — a pasta, o pacote e o repositório continuam `claflow-web`)
- [x] T021 [US2] Tirar as cenas antigas e o componente delas (`src/components/WebGPUCanvas.tsx`, o conteúdo de demonstração de `App.tsx`, os assets do modelo do Vite) em `claflow-web/src/`
  - **Reconciliação (2026-11-12, 034 T071)**: no app, `3586df0` (claflow-web): `src/components/WebGPUCanvas.tsx`, `App.css` e os assets do modelo do Vite retirados; `App.tsx` reescrito com o catálogo.
- [x] T022 [US2] Dependência do motor: `clayflow` por `file:../clayflow` em `claflow-web/package.json`; `vite.config.ts` com o alias de `clayflow` e `clayflow/web` às fontes do motor (HMR) e o `?raw` dos shaders; `tsconfig` com os caminhos
  - **Reconciliação (2026-11-12, 034 T071)**: no app, `3586df0`: `"clayflow": "file:../clayflow"` no `package.json`; `vite.config.ts` com os apelidos de `clayflow` e `clayflow/web` para as fontes do motor (HMR, os `?raw` dos shaders resolvidos pelo Vite como no motor; `CLAYFLOW_ENGINE` em `eccfd10`). Diferença: o `tsconfig` não tem `paths` — os tipos vêm do pacote `file:`.
- [x] T023 [P] [US2] O apoio de cena das cenas de vídeo no app, pela API pública: `claflow-web/src/scenes/support/` com as partes de `giScenes`, `materialScenes`, `causticScenes`, `waterScene`, `surfaceScenes` que as cenas usam (sem importar o apoio dos smokes do motor)
  - **Reconciliação (2026-11-12, 034 T071)**: no app, `3586df0`: `src/scenes/support/` com `giScenes`, `materialScenes`, `causticScenes`, `waterScene` e `random`, importando só de `clayflow` (sem o apoio dos smokes do motor); `hdr.ts` (leitor de HDR) em `417ddb5`. Sem `surfaceScenes`: as cenas que usam superfícies montam pela API pública no próprio catálogo.
- [x] T024 [US2] As cenas em `claflow-web/src/scenes/` (uma por arquivo: lente, dispersão, ondulação, agua, molhar, causticasvidro, causticas, natureza, cornell, dia, névoa, sprites, pano e as de pendência) e o catálogo `claflow-web/src/scenes/index.ts`
  - **Reconciliação (2026-11-12, 034 T071)**: no app, `3586df0`: as cenas `lente`, `dispersao`, `ondulacao`, `agua`, `molhar`, `causticasvidro`, `causticas`, `natureza`, `cornell`, `dia`, `nevoa`, `sprites`, `pano` e as de pendência (`pendparada`, `pendagitada`, `pendagitadasem`, `pendcoexistencia`, `penddentro`). Diferença: num arquivo só, `src/scenes/catalog.ts` (`SHOTS`), não uma cena por arquivo com `index.ts`.
- [x] T025 [US2] A página da cena no app: `App.tsx` com o catálogo e `?scene=<nome>` (o canvas pelo `clayflow/web`, a câmera orbital, pausa), e a página do gravador `claflow-web/src/recorder/page.ts` (a leitura direta da GPU e a entrega dos quadros de hoje)
  - **Reconciliação (2026-11-12, 034 T071)**: no app, `3586df0`: `App.tsx` com a lista e `?scene=<nome>` pelo `clayflow/web`, e `src/recorder/page.ts` com `recorder.html`; a navegação no tempo (pausa, quadro a quadro, velocidade, câmera livre) em `66aea1e` (`TimeNavigator.ts`, `TimeControls.tsx`).
- [x] T026 [US2] O gravador pelo Chrome movido para `claflow-web/runner/video.ts` (com `browser.ts`/`server.ts` do que ele usa), script `npm run video` com as mesmas opções (`--frames`, `--lossless`, `--10bit`, `--size`, `--timeout`, `--aa`)
  - **Reconciliação (2026-11-12, 034 T071)**: no app, `3586df0`: `runner/video.ts`, `runner/browser.ts`, `runner/server.ts` e o script `npm run video`, com `--frames`, `--lossless`, `--10bit`, `--size`, `--timeout`, `--aa` (e `--profile`, `e4c8f67`).
- [ ] T027 [US2] A página `agua` interativa do bench (`bench/agua.html`, `bench/page/agua.ts`, hoje fora do commit) como a cena interativa `agua` do app, com os controles dela (girar, aproximar, pausar, recomeçar, `?res`, `?look`, `?s`)
  - **Reconciliação (2026-11-12, 034 T071)**: a cena `agua` do app gira, aproxima e pausa (`3586df0`, `4dafc9b`, `66aea1e`); faltam recomeçar, `?res`, `?look` e `?s`, e a página antiga segue no motor fora do registro (`bench/agua.html`, `bench/page/agua.ts`). Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial: a cena `agua` do app gira, aproxima e pausa (`claflow-web` `src/ScenePanel.tsx:302`, `src/TimeControls.tsx:16`) e a resolução vem por `?w`/`?h` (`src/scenes/catalog.ts:41`); faltam o R (recomeçar), `?look` e `?s` — que a janela nativa `deno/agua.ts` tem (R) e a página antiga do motor tem (`bench/page/agua.ts`, ainda fora do registro, sem estar no `origin/develop`).
- [x] T028 [US2] Sem comparação de quadros (decisão do usuário de 2026-10-28: "o código das cenas é o mesmo" — a conferência é pelos vídeos gravados pelo app). Antes: conferir a migração: gravar os 60 quadros de cada cena pelo app (`--lossless`) e, por quadro, o PSNR app × linha de base não abaixo do PSNR linha de base × segunda gravação (SC-003, R9) — quadro abaixo é investigado até a causa, sem regravar a linha de base
- [ ] T029 [US2] `claflow-web/README.md`: o que é o app, como rodar, as cenas, os dois gravadores
  - **Reconciliação (2026-11-12, 034 T071)**: o `README.md` do app ainda é o do modelo do Vite. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: o `README.md` do `claflow-web` (inclusive na ponta, `feature/041-nuvens-volumetricas` `8bab445`) ainda é o do modelo do Vite ("React + TypeScript + Vite").

**Checkpoint**: o app tem todas as cenas e grava os mesmos quadros.

---

## Phase 4: User Story 1 — o motor sem cenas (P1)

**Goal**: nenhuma cena de vídeo nem página de demonstração no motor; os smokes ficam

**Independent Test**: a busca não acha cena de vídeo nem página de demonstração no motor; a suíte igual à linha de base

- [ ] T030 [US1] Tirar do motor `src/__smokes__/videoScenes.ts`, `bench/runner/video.ts`, o script `video` do `package.json` e o que só eles usavam
  - **Reconciliação (2026-11-12, 034 T071)**: `src/__smokes__/videoScenes.ts`, `bench/runner/video.ts` e o script `video` do `package.json` seguem no motor. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: no `origin/develop` (`2fd2429e`) seguem `src/__smokes__/videoScenes.ts`, `bench/runner/video.ts` e o script `video` (`package.json:57`).
- [ ] T031 [US1] A página antiga `index.html` + `src/main.ts` (verificação da Fase E: profiler, `createAsync`, `DebugFlow`): conferir se um smoke cobre o que ela verifica; se não, virar o smoke `profilerAsync` em `src/__smokes__/`; depois tirar as duas (R7)
  - **Reconciliação (2026-11-12, 034 T071)**: `index.html` e `src/main.ts` seguem no motor; não há smoke `profilerAsync`. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: `index.html` e `src/main.ts` seguem no motor; nenhum smoke cobre o que a página verifica por inteiro — o `createAsync` está no `readiness`, mas nem o `readRange` do profiler (E.1) nem o `profilerStats` do `DebugFlow` (E.3) aparecem em `src/__smokes__/`; sem smoke `profilerAsync`.
- [ ] T032 [US1] O apoio dos smokes (`src/__smokes__/support/*`) só com o que os smokes usam (`knip` sem código morto); o `README.md` dos smokes sem as cenas de vídeo
  - **Reconciliação (2026-11-12, 034 T071)**: depende da T030. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: depende da T030; `src/__smokes__/support/` segue com o apoio das cenas de vídeo.
- [ ] T033 [US1] Verificação: `npm test`, `tsc`, lint, `knip`, `madge`, `build:lib` e os smokes da linha de base com os mesmos resultados (SC-001, SC-004)
  - **Reconciliação (2026-11-12, 034 T071)**: depende da T030–T032. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: depende da T030–T032. O `npm run ci` verde da 034 T075 (`37455cdd`) não é esta verificação (o motor ainda tem as cenas).

**Checkpoint**: o motor só tem capacidades, testes e o benchmark.

---

## Phase 5: User Story 3 — o núcleo puro e o ponto de entrada web (P2)

**Goal**: o núcleo provado sem DOM; o navegador só pelo `clayflow/web`

**Independent Test**: o núcleo carrega no Deno; o lint barra as globais do navegador fora de `platform/web`

- [x] T034 [US3] Lint de pureza (R2) em `eslint.config.js`: `no-restricted-globals` (`document`, `window`, `navigator`, `HTMLCanvasElement`, `OffscreenCanvas`, `ResizeObserver`, `requestAnimationFrame`, `cancelAnimationFrame`, `Image`, `FontFace`, `Deno`) em `src/**` exceto `src/platform/web/**`, `src/platform/deno/**`, testes e smokes; o lint passa
- [ ] T035 [US3] Teste no Deno `bench/deno/core.test.ts`: importar `dist/index.js` (o núcleo) e montar o `Engine` com uma `TextureSurface` e o `ManualClock`, um quadro, sem erro (SC-002); `deno.json` do motor com a task `test:deno`
  - **Reconciliação (2026-11-12, 034 T071)**: não há `bench/deno/` nem `deno.json` no motor. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: sem `bench/deno/` nem `deno.json` no motor.
- [ ] T036 [US3] Guia: `clay-engine-doc` com os pontos de entrada (`clayflow` e `clayflow/web`), o guia de migração do import do `Application` e a mudança do nome do pacote; `api-pendencias.md` da 034 com a quebra
  - **Reconciliação (2026-11-12, 034 T071)**: a quebra está em `specs/034-refracao-fisica/api-pendencias.md` §7; faltam no `clay-engine-doc` os pontos de entrada e o guia de migração do import do `Application` (o `video.md` só usa o `clayflow/web`). Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial, sem mudança: a quebra está em `specs/034-refracao-fisica/api-pendencias.md` §7 e a referência gerada da API tem `clay-engine-doc/docs/api/platform/web/` e `…/platform/deno/`; faltam nos guias os pontos de entrada e a migração do import do `Application` — o `getting_started.md` ainda instala e importa `webgpu-engine` (`:13`, `:41`).

**Checkpoint**: o núcleo é puro e verificado.

---

## Phase 6: User Story 4 — o motor no Deno (P2)

**Goal**: o motor roda no Deno em textura e em janela; os shaders compilam no naga; o gravador pelo Deno

**Independent Test**: uma cena com água, vidro e luz grava pelo Deno; o smoke do naga sem falhas

### Testes primeiro

- [ ] T037 [P] [US4] Teste no Deno `bench/deno/limits.test.ts`: o ponto de entrada Deno pede ao dispositivo o máximo do adaptador nos limites de ligação e nos de escala, sem o teto do navegador (R5, FR-009)
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem `bench/deno/limits.test.ts`). Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial: a regra está no núcleo, comum aos ambientes (`src/core/gpu/GpuContext.ts`, `resolveLimits`: os limites de escala e os de desenho, `ENGINE_DRAWING_LIMITS`, no máximo do adaptador; `b32ccaee`) e tem teste de unidade com um adaptador que informa 31 buffers de storage (`src/core/gpu/__tests__/GpuContext.capabilities.test.ts:164`); falta o teste no Deno com o adaptador real (`bench/deno/limits.test.ts`).
- [ ] T038 [P] [US4] Smoke do naga `bench/deno/naga.ts` (R4): com o `dist/`, as cenas mínimas dos smokes que não usam o DOM, em `TextureSurface`, com `pushErrorScope('validation')` em volta da criação dos pipelines, um `setPipeline` sem despacho de cada um (o wgpu cria sem erro o pipeline que o compilador da plataforma recusou; ver R4) e os `engineError`; relatório por pipeline (compila / erro e mensagem) em `specs/038-motor-puro-web/naga.md`
  - **Reconciliação (2026-11-12, 034 T071)**: não feita (sem `bench/deno/naga.ts` nem `naga.md`). Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: sem `bench/deno/naga.ts` nem `specs/038-motor-puro-web/naga.md`; o único teste do naga registrado (`zzNaga.test.ts`, em `75057417`) era experimento e saiu em `bf888156` (PR #51).

### Implementação

- [x] T039 [US4] O `Application` do Deno em `src/platform/deno/Application.ts` (contracts/entry-points.md): `target` (textura, `step`, `read`) e `window`; `LoopClock` em `src/platform/deno/LoopClock.ts`
- [x] T040 [US4] A janela SDL2 por FFI em `src/platform/deno/sdl.ts` (só as funções usadas: criar e fechar a janela, os eventos, o tamanho) e o `DenoPlatformAdapter` em `src/platform/deno/DenoPlatformAdapter.ts` (o `navigator.gpu` do Deno; a janela sobre `Deno.UnsafeWindowSurface`, criada no primeiro uso do contexto — o Deno a exige depois do pedido do adaptador —, com a `NSWindow` no `windowHandle` e a view Metal da SDL no `displayHandle` no Mac; a textura pela `TextureSurface` do núcleo); `SdlInputSource` em `src/platform/deno/SdlInputSource.ts` (ponteiro, teclado, redimensionar, fechar); SDL ausente = `engineError` com o nome da biblioteca (sem falha silenciosa)
- [x] T041 [US4] `src/platform/deno/index.ts` completo (núcleo + `Application`, superfícies, relógio, entrada SDL) e a entrada no build
- [ ] T042 [US4] Rodar o naga (T038) e corrigir no WGSL do motor o que ele recusar, um por vez, cada correção conferida pelos smokes de imagem no Chrome (as fixtures bit a bit iguais) e pelo orçamento de passos dos laços (regra contra travamento); 100 % compilando (SC-005)
  - **Reconciliação (2026-11-12, 034 T071)**: depende da T038. Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial: correções do WGSL pelo naga/wgpu foram feitas à medida que apareciam — `b32ccaee` (composição nos acertos e cáusticas por instância, contra o compilador da Apple pelo naga) e `43d0f560` (o teste de finito pelos bits do expoente e o `0u - N` que o naga recusa); falta a rodada pelo smoke do naga (T038) com o relatório e os 100 % compilando (SC-005).
- [ ] T043 [US4] O gravador pelo Deno no app: `claflow-web/deno/video.ts` (as cenas do catálogo em `TextureSurface`, os quadros no `stdin` do ffmpeg, as mesmas saídas e a conferência do gravador do Chrome) e `claflow-web/deno.json` com a task `video`
  - **Reconciliação (2026-11-12, 034 T071)**: o gravador pelo Deno existe só para o tanque: `claflow-web/deno/video.ts` e a task `video` no `deno.json` (`eccfd10`); faltam as cenas do catálogo e a conferência contra o gravador do Chrome. Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial, sem mudança: `claflow-web/deno/video.ts` e a task `video` do `deno.json` (`eccfd10`) gravam só o tanque (`waterScene`); faltam as cenas do catálogo e a conferência contra o gravador do Chrome.
- [ ] T044 [US4] Gravar pelo Deno uma cena com água, vidro e luz (a `agua`) e enviar o vídeo ao usuário (SC-006); comparar com a gravação do Chrome (a diferença entre os dois compiladores medida, não exigida igual)
  - **Reconciliação (2026-11-12, 034 T071)**: sem registro da gravação pelo Deno enviada nem da comparação com a do Chrome (não há `agua-deno.mp4` em `claflow-web/videos/`). Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: não há `agua-deno.mp4` em `claflow-web/videos/` nem registro da comparação com a gravação do Chrome.
- [ ] T045 [US4] Uma cena na janela nativa (`deno run … claflow-web/deno/window.ts agua`) aberta e fechada sem processo órfão
  - **Reconciliação (2026-11-12, 034 T071)**: a janela nativa existe como `claflow-web/deno/agua.ts` (`deno task agua`; `3586df0`, `a557d20`), não `window.ts`; falta o registro de abrir e fechar sem processo órfão. Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial: a janela nativa existe como `claflow-web/deno/agua.ts` (`deno task agua`; `3586df0`, e pelo renderizador da cena em `a557d20`), com girar, aproximar, pausar, R e fechar a janela para sair; falta o registro de abrir e fechar sem processo órfão.

**Checkpoint**: o motor roda no Deno; o gravador funciona nos dois ambientes.

---

## Phase 7: Polish

- [ ] T046 [P] Guia do Deno em `clay-engine-doc`: o `clayflow/deno`, a textura e a janela, os limites (no Deno, o máximo do adaptador; o teto de 10 buffers de storage é do navegador), a SDL2 como requisito da janela
  - **Reconciliação (2026-11-12, 034 T071)**: o `video.md` (034 T072) cita o `clayflow/deno` no gravador; falta o guia do Deno (textura, janela, limites, SDL2). Segue na 038.
  - **Conferência (2026-11-17)**: (c) parcial: o `video.md` (`:59`) descreve o `clayflow/deno` em textura; faltam a janela, os limites e a SDL2 como requisito num guia do Deno.
- [ ] T047 [P] JSDoc em todos os exports novos (`npm run doc:coverage`)
  - **Reconciliação (2026-11-12, 034 T071)**: sem registro de `npm run ci` (que roda o `doc:coverage`) depois da volta da 038 à 034 (`289b2137`): o gate da 039 (T114) rodou tsc, lint, testes e smokes, sem o `doc:coverage`. Segue na 038; a 034 T075 roda o `npm run ci`.
  - **Conferência (2026-11-17)**: (c) parcial: o `doc:coverage` passou no `npm run ci` da 034 T075 (`37455cdd`), mas o script só olha `src/index.ts` (`package.json:39`): os exports de `clayflow/web` e `clayflow/deno` (`src/platform/*/index.ts`) ficam fora da conferência (as declarações de topo têm JSDoc à vista). Falta o `doc:coverage` com as três entradas.
- [ ] T048 Gate completo do motor (`npm run ci`) e do app (`npm run build`, lint); a suíte contra `baseline.md` (SC-004) e o relatório final da spec em `specs/038-motor-puro-web/tasks.md` (os números de cada critério)
  - **Reconciliação (2026-11-12, 034 T071)**: não feita. Segue na 038.
  - **Conferência (2026-11-17)**: (d) não entregue: sem o gate da spec (motor e app) contra `baseline.md` nem o relatório final; o `npm run ci` verde da 034 T075 (`37455cdd`) é anterior às tarefas abertas.

---

## Dependencies & Execution Order

- **Phase 1** antes de tudo (a linha de base é gravada com o código de antes).
- **Phase 2** bloqueia todas as histórias.
- **US2 (Phase 3)** antes de **US1 (Phase 4)**: as cenas chegam ao app antes de sair do motor.
- **US3 (Phase 5)** depois da Phase 2; o T035 precisa do `build:lib` com a entrada do núcleo.
- **US4 (Phase 6)** depois da Phase 2 e do T035; o T043 precisa do app (Phase 3).
- **Phase 7** no fim.

### Parallel Opportunities

- T004–T007 (testes dos contratos) juntos.
- T023 junto com T021–T022 (repositório diferente).
- T037 e T038 juntos.
- T046 e T047 juntos.

## Implementation Strategy

Entrega completa, na ordem das dependências: linha de base → fundação (o comportamento de hoje preservado) → o app com
as cenas (quadros iguais) → a limpeza do motor → a pureza provada → o Deno (textura, naga, janela, gravador) → docs e
gate. Cada fase termina com a suíte igual à linha de base; nenhuma fixture regravada sem decisão do usuário; nenhum
laço de shader sem orçamento total de passos.
