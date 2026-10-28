# Research: Motor puro e o app clayflow-web (spec 038)

Levantamento de 2026-10-28 no código da `feature/038-motor-puro-web` (a partir de `2f710aff`) e no `claflow-web`
(`511de38`).

## R1. O que do núcleo depende do navegador

**Medido** (busca por `document.`, `window.`, `HTMLCanvasElement`, `requestAnimationFrame`, `OffscreenCanvas`,
`ResizeObserver`, `navigator.gpu`, `addEventListener` fora de testes e smokes): 18 arquivos.

| Camada | Arquivos                                                                                                                                             | O que usam                                                                                                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| C1     | `core/gpu/GpuContext.ts`, `core/gpu/GpuEngineCore.ts`, `core/contracts/EngineCore.ts`                                                                | o canvas como superfície (`HTMLCanvasElement`, `getContext('webgpu')`), `navigator.gpu` (existe também no Deno) |
| C2     | `scene/SceneContext.ts`, `scene/index.ts`                                                                                                            | o tipo do canvas repassado à C1                                                                                 |
| C4     | `presentation/app/Application.ts`, `GameLoop.ts`, `sceneInteraction.ts`                                                                              | o canvas, `ResizeObserver`/`window.resize`, `requestAnimationFrame`                                             |
| C4     | `presentation/input/*` (`PointerDevice`, `TouchDevice`, `InteractionSystem`, `controllers/FpsController`), `presentation/ui/UiInteractionHandler.ts` | eventos do DOM                                                                                                  |
| C4     | `presentation/ui/UiGpuPipeline.ts`, `presentation/assets/FontLoader.ts`, `HeightmapLoader.ts`                                                        | `OffscreenCanvas` (texto e imagem rasterizados no CPU), `createImageBitmap`                                     |
| C4     | `presentation/flows/DebugFlow.ts`                                                                                                                    | `window.addEventListener('keydown')`                                                                            |
| —      | `src/main.ts` + `index.html`                                                                                                                         | página antiga de verificação da Fase E (profiler, `createAsync`, `DebugFlow`)                                   |

**Medido no Deno 2.7.9** (M4 Max): `navigator.gpu` e `createImageBitmap` existem; `OffscreenCanvas` e
`requestAnimationFrame` não; `Deno.UnsafeWindowSurface` existe (janela por SDL2, instalado: `libSDL2-2.0.dylib`).

**Decision** (padrão adapter, decisão do usuário de 2026-10-28): o núcleo obtém o adaptador da GPU e o contexto de
apresentação por um `PlatformAdapter` (contrato da C1): `requestAdapter(opções)`, o formato preferido e `getContext(alvo)`
— que devolve uma `PresentationSurface` (o contexto compatível com o `GPUCanvasContext`, o tamanho, `present()`).
Implementações: `WebPlatformAdapter` (no `clayflow/web`: `navigator.gpu`, `canvas.getContext('webgpu')`) e
`DenoPlatformAdapter` (no `clayflow/deno`: o `navigator.gpu` do Deno, a janela por `Deno.UnsafeWindowSurface`); a
textura com leitura de volta (`TextureSurface`) é do núcleo, servida pelos dois adaptadores. O laço de quadros vira contrato da C4
(`FrameClock`): `requestAnimationFrame` no web, laço próprio no Deno. Entrada (ponteiro, toque, teclado, controladores),
UI rasterizada no CPU e carregadores de imagem e fonte ficam no ponto de entrada web (são do navegador); no Deno, a
entrada vem dos eventos da janela SDL quando houver janela.
**Rationale**: a C1 já é a fronteira com o hardware e a constituição pede backend substituível sem tocar C2/C3/C4; a
superfície é hardware de apresentação. O laço e a entrada são da apresentação (C4).
**Alternatives considered**: (a) manter o canvas e emular o DOM no Deno (polyfill) — rejeitado: o núcleo continuaria
impuro e o polyfill mentiria sobre o que existe; (b) passar só um `GPUCanvasContext` à C1 — insuficiente para a textura
com leitura de volta (não há contexto) e para o redimensionamento.

## R2. Como garantir o núcleo puro

**Decision**: duas verificações. (1) Lint: `no-restricted-globals` (`document`, `window`, `HTMLCanvasElement`,
`OffscreenCanvas`, `ResizeObserver`, `requestAnimationFrame`, `cancelAnimationFrame`, `Image`, `Deno`) em todo `src/`
exceto `src/platform/web/**`, `src/platform/deno/**`, testes e smokes. (2) Execução: um teste no Deno importa o núcleo
construído e cria o motor sem superfície (SC-002).
**Rationale**: o lint pega na hora da escrita; a execução no Deno prova que nada do navegador roda no carregamento.
**Alternatives considered**: um `tsconfig` do núcleo sem a lib `DOM` — rejeitado: `@webgpu/types` referencia
`HTMLCanvasElement`/`OffscreenCanvas` nos tipos do contexto do canvas; tirar a lib quebra os tipos do WebGPU.

## R3. Os shaders `.wgsl` nos dois ambientes

**Medido**: 308 importações `?raw` em 33 arquivos. O build da biblioteca (Vite, modo lib) já embute o texto dos shaders
no `dist/index.js`.

**Decision**: o Deno consome o motor construído (`dist/`), com três entradas no build: `index` (núcleo), `web` e `deno`.
As fontes continuam com `?raw` (o Vite e o Vitest os resolvem); nada muda nos 33 arquivos.
**Rationale**: zero mudança nas fontes; um único caminho de import; o Deno roda o mesmo código que o navegador.
**Alternatives considered**: (a) `import … with { type: 'text' }` (Deno com `--unstable-raw-imports`) — o Vite não o
entende como `?raw`, seriam duas sintaxes; (b) gerar um módulo TypeScript com as strings — um passo de build a mais e
um arquivo gerado a manter.

## R4. Compatibilidade com o naga (o compilador de WGSL do wgpu)

**Decision**: smoke Deno `nagaShaders`: com o motor construído, roda as cenas mínimas dos smokes (as do apoio que não
usam o DOM) desenhando em textura e coleta todo erro de validação de pipeline (`device.pushErrorScope('validation')` em
volta da criação, mais os `engineError` do motor); lista por pipeline o que compila e o que não, com a mensagem. Os que
falham são corrigidos no WGSL sem mudar o resultado no Chrome (os smokes de imagem iguais, bit a bit nas fixtures).
**Rationale**: as pipelines reais só existem com as composições da cena (pontos, contribuições); compilar os módulos
soltos não cobre o que roda.
**Alternatives considered**: compilar cada `.wgsl` solto — rejeitado: a maioria só é válida composta.

## R5. Limites do Deno contra os do navegador

**Medido**: Deno (wgpu, M4 Max) 31 buffers de storage por estágio, 128 texturas de storage, 4 GB por ligação de
storage; Chrome (Dawn, mesmo Mac) 10 e 8.

**Decision**: o motor pede, nos dois ambientes, no máximo os limites portáteis (`ENGINE_PORTABLE_LIMITS`, o mínimo
comum entre o M4 no Chrome e a RTX 4090) para os limites de ligação; os de escala (tamanho de buffer, invocações) seguem
o máximo do adaptador. Um teste confere que o ponto de entrada Deno pede o teto portátil (FR-009).
**Rationale**: um pipeline que só compila no Deno quebraria no navegador; o Deno não é desculpa para passar do teto.

## R6. O pacote e os pontos de entrada

**Decision**: o pacote passa de `webgpu-engine` para `clayflow` (os smokes já importam `clayflow` por alias), com
`exports`: `.` (núcleo), `./web`, `./deno`. Fontes: `src/index.ts` (núcleo), `src/platform/web/index.ts`,
`src/platform/deno/index.ts`. O `Application` atual vira o do web (`clayflow/web`); o núcleo expõe a montagem do motor
sobre uma `PresentationSurface` e um `FrameClock`; o Deno tem o seu `Application` (textura ou janela).
**Rationale**: o app escolhe o ambiente pelo import; o núcleo não carrega nada de plataforma.
**Alternatives considered**: um pacote por plataforma — mais repositórios e versões para alinhar, sem ganho agora.

## R7. O que sai do motor

**Medido**: `bench/page/main.ts` e `sampler.ts` são o harness de benchmark contra o Three.js (medida do motor), não
demonstração. Saem: `src/__smokes__/videoScenes.ts` com o gravador (`bench/runner/video.ts`, o script `video`), a página
`bench/agua.html` + `bench/page/agua.ts` e a página antiga `index.html` + `src/main.ts`.

**Decision**: o harness de benchmark fica no motor (corrige a premissa da spec, que o incluía entre as páginas de
demonstração). A página `src/main.ts` vira smoke se o que ela verifica (profiler, `createAsync`, `DebugFlow`) não estiver
coberto por um smoke existente; senão, sai. As cenas que os smokes também usam (`support/waterScene.ts`, `giScenes`,
`materialScenes`, `causticScenes`, `surfaceScenes`) ficam no motor para os smokes; o app recebe as próprias versões
das partes de cena de que precisa, pela API pública (sem importar o apoio dos smokes).
**Rationale**: o benchmark mede o motor; as cenas do app são conteúdo e podem evoluir sem mexer nos testes.

## R8. O clayflow-web

**Medido**: React 19 + Vite 8; `src/components/WebGPUCanvas.tsx` monta as cenas antigas; o `vite.config.ts` aponta
`webgpu-engine` para `../engine/src/index.ts` (caminho que não existe mais); remoto `github.com/dantasgut/claflow-web`.

**Decision**: a pasta passa a `geom-diff-calc/clayflow-web`; o pacote, a `clayflow-web`; a dependência, `clayflow` por
`file:../clayflow` com o alias do Vite para as fontes (HMR) e o `clayflow/web` como ponto de entrada; as cenas antigas e
o componente saem; entram um catálogo de cenas, a página de cena (escolha pela URL), o gravador de vídeo pelo navegador
(o runner atual, movido) e o gravador pelo Deno (`deno task video`). Renomear o repositório no GitHub é ação externa:
pede confirmação do usuário na implementação.
**Rationale**: mantém o histórico do app; o alias às fontes evita rebuild a cada mudança do motor.

## R9. Quadros antes e depois da migração (SC-003)

**Medido**: duas gravações do mesmo código (60 quadros, FFV1 sem perda) diferem em todos os quadros — `agua` PSNR
52,5 / 58,7 / 63,7 dB (mínimo, mediana, máximo), `cornell` 32,6 / 46,2 / 50,1 dB. Causa provável: a compilação
assíncrona faz um número variável de quadros internos antes do motor ficar pronto, e os acúmulos temporais começam de
estados diferentes (não confirmada).

**Decision** (decisão do usuário de 2026-10-28): cada cena gravada duas vezes pelo motor (a linha de base e a variação
dela) e uma pelo app; por quadro, o PSNR app × motor não fica abaixo do PSNR motor × motor (a mesma posição do quadro).
**Alternatives considered**: tornar a gravação determinística — trabalho fora desta spec.

## R10. Janela nativa no Deno

**Decision**: `Deno.UnsafeWindowSurface` sobre uma janela SDL2 aberta por FFI (`Deno.dlopen` da `libSDL2`), dentro do
ponto de entrada Deno, com os eventos da janela (redimensionar, fechar, teclado e ponteiro) traduzidos para os mesmos
eventos de entrada do motor. Sem dependência de pacote de terceiros: as poucas funções da SDL que o motor usa
declaradas no próprio módulo.
**Rationale**: a SDL é multiplataforma (Mac, Windows, Linux); o FFI direto evita depender de um pacote externo.
**Alternatives considered**: um pacote de janela do JSR — dependência externa a mais, com versões a acompanhar.
