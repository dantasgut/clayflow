# Data Model: Motor puro e o app clayflow-web (spec 038)

## PlatformAdapter (C1, contrato em `core/contracts`; padrão adapter, decisão do usuário de 2026-10-28)

O que o núcleo pede ao ambiente. O núcleo nunca toca `navigator`, canvas nem `Deno`.

| Operação                  | Descrição                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `requestAdapter(options)` | o adaptador da GPU (potência, fallback)                                                           |
| `preferredFormat()`       | o formato preferido da apresentação                                                               |
| `getContext(target)`      | a `PresentationSurface` do alvo (canvas, janela) ou a `TextureSurface` (alvo `{ width, height }`) |

Implementações: `WebPlatformAdapter` (`clayflow/web`), `DenoPlatformAdapter` (`clayflow/deno`).

## PresentationSurface (C1, contrato em `core/contracts`, reexportado como tipo pela C2)

Onde o quadro final é apresentado.

| Campo / operação             | Descrição                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `kind`                       | `'canvas' \| 'texture' \| 'window'`                                                                   |
| `width`, `height`            | tamanho atual em pixels                                                                               |
| `format`                     | formato da imagem (o preferido do adaptador, ou `rgba16float` quando pedido)                          |
| `configure(device, options)` | prepara a superfície no dispositivo (o `configure` do contexto, ou a textura alvo)                    |
| `currentTexture()`           | a textura do quadro corrente                                                                          |
| `present()`                  | apresenta (canvas e janela: implícito/`present()` do contexto; textura: nada)                         |
| `read()`                     | os pixels do quadro apresentado (a leitura de hoje do canvas; textura: cópia para staging)            |
| `onResize(listener)`         | avisa quando o tamanho muda (canvas: `ResizeObserver`; janela: evento da SDL; textura: só por pedido) |
| `dispose()`                  | libera                                                                                                |

Implementações: o contexto do canvas pelo `WebPlatformAdapter`, a janela pelo `DenoPlatformAdapter`, e a `TextureSurface` (núcleo, servida pelos dois).

**Regras**: a C1 é a única que toca a superfície; o núcleo nunca vê `HTMLCanvasElement` nem `Deno`; o tamanho muda só
pelo `onResize` (que emite `canvasReconfigured`, como hoje).

## FrameClock (C4, contrato)

Quem chama o quadro.

| Campo / operação         | Descrição                             |
| ------------------------ | ------------------------------------- |
| `start(tick)` / `stop()` | começa e para de chamar `tick(nowMs)` |
| `now()`                  | relógio monotônico (ms)               |

Implementações: `AnimationFrameClock` (web, `requestAnimationFrame`), `LoopClock` (Deno: laço com
`setTimeout(0)`/eventos da janela, no ritmo da apresentação), `ManualClock` (quem chama `step` à mão: smokes,
gravador, testes).

## InputSource (C4, contrato existente generalizado)

Os eventos de ponteiro, toque e teclado em vocabulário do motor. Implementações: DOM (web) e SDL (janela do Deno). Os
controladores (`OrbitController`, `FpsController`) consomem o contrato, não o DOM.

## Pontos de entrada

| Entrada         | Importa                  | Exporta                                                                                       |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `clayflow`      | só o núcleo              | recursos, Flows, `createScene`, montagem do motor sobre `PresentationSurface` + `FrameClock`  |
| `clayflow/web`  | núcleo + `platform/web`  | `Application` (canvas), `CanvasSurface`, entrada DOM, `FontLoader`, `HeightmapLoader`, UI     |
| `clayflow/deno` | núcleo + `platform/deno` | `Application` do Deno (textura ou janela), `TextureSurface`, `DenoWindowSurface`, entrada SDL |

## Cena (clayflow-web)

| Campo        | Descrição                                           |
| ------------ | --------------------------------------------------- |
| `name`       | nome na URL e no gravador                           |
| `frames`     | quadros do vídeo                                    |
| `build(app)` | monta os recursos; devolve a atualização por quadro |

Mesma forma das cenas de vídeo de hoje (`videoScenes.ts`); o catálogo é a lista delas.
