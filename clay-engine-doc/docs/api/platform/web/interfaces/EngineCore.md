[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EngineCore

# Interface: EngineCore

Defined in: [src/core/contracts/EngineCore.ts:134](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L134)

EngineCore é a fronteira da Camada 1 (Hardware) — abstração estável
sobre o WebGPU device. Todas as operações GPU passam por aqui:
  - **Specs como identidade**: `create(spec)` congela a spec e a identifica
    pelo hash do conteúdo (UUIDv5, memorizado por objeto); `destroy(spec)`
    libera a posse daquela spec.
  - **Frame-scoped recording**: `record(body)` abre um command encoder e
    passa um `Frame` para o body emitir compute/render passes; `submit()`
    finaliza e enfileira na queue.
  - **Lifecycle resiliente**: `initialize`/`shutdown`, recovery de
    device-lost, error scope opt-in, memory budget tracking.

Implementação concreta: `GpuEngineCore` (em `core/gpu/`).
Camadas 2-4 dependem desta interface, não da implementação.

## Properties

### canvasFormat

> `readonly` **canvasFormat**: `GPUTextureFormat`

Defined in: [src/core/contracts/EngineCore.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L138)

Formato do canvas em uso (o preferido, e.g. 'bgra8unorm', ou `rgba16float` na saída HDR). Setado em initialize.

***

### canvasOptions

> `readonly` **canvasOptions**: `CanvasOptions`

Defined in: [src/core/contracts/EngineCore.ts:142](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L142)

Opções de canvas guardadas (as de `initialize` ou do último `reconfigureCanvas` com opções).

***

### canvasOutput

> `readonly` **canvasOutput**: `CanvasOutput`

Defined in: [src/core/contracts/EngineCore.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L140)

Formato e mapeamento de tons do canvas efetivamente configurados (spec 011).

***

### profiler

> `readonly` **profiler**: `Profiler`

Defined in: [src/core/contracts/EngineCore.ts:136](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L136)

Profiler de timestamp-query (no-op se device não suporta a feature).

## Methods

### canvasSize()

> **canvasSize**(): \{ `height`: `number`; `width`: `number`; \} \| `undefined`

Defined in: [src/core/contracts/EngineCore.ts:168](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L168)

Tamanho atual do canvas anexado (pixels do backbuffer), ou `undefined` sem canvas. Usado pela C2 para
alocar texturas declaradas com `sizeFromCanvas`.

#### Returns

##### Type Literal

\{ `height`: `number`; `width`: `number`; \}

###### height

> `readonly` **height**: `number`

Altura em pixels do backbuffer.

###### width

> `readonly` **width**: `number`

Largura em pixels do backbuffer.

***

`undefined`

***

### capabilities()

> **capabilities**(): [`DeviceCapabilities`](DeviceCapabilities.md)

Defined in: [src/core/contracts/EngineCore.ts:182](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L182)

Capacidades efetivas do device atual: adaptador, preferência de potência, features obtidas e ausentes,
limites efetivos e limites pedidos que foram reduzidos ao máximo do adaptador. Só dados; recalculado a cada
criação de device (`initialize` e `requestRecover`). Lança se o core não foi inicializado.

#### Returns

[`DeviceCapabilities`](DeviceCapabilities.md)

***

### create()

> **create**\<`S`\>(`spec`): `S`

Defined in: [src/core/contracts/EngineCore.ts:243](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L243)

Cria (ou reutiliza, por conteúdo) o objeto de GPU descrito por `spec` e devolve `spec`.

A spec passa a ser **imutável em profundidade**: qualquer atribuição posterior lança `TypeError`. Specs
aninhadas (shader num pipeline, layout/buffers num bind group) também ficam congeladas — para mudar um
recurso, crie uma spec nova. A identidade (`specHash`) é calculada no máximo uma vez por objeto de spec.

Specs de conteúdo igual (inclusive aninhado) compartilham o mesmo objeto de GPU. Cada chamada registra `spec`
como dona desse objeto; `destroy(spec)` remove só essa posse.

#### Type Parameters

##### S

`S` *extends* `ResourceSpec`

#### Parameters

##### spec

`S`

#### Returns

`S`

***

### createAsync()

> **createAsync**\<`S`\>(`spec`): `Promise`\<`S`\>

Defined in: [src/core/contracts/EngineCore.ts:249](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L249)

Como `create`, mas pipelines (compute/render) compilam em background via `createXxxPipelineAsync()`.
Chamadas concorrentes com specs de mesmo conteúdo compilam uma única vez. Para outros kinds, equivale a
`create()`.

#### Type Parameters

##### S

`S` *extends* `ResourceSpec`

#### Parameters

##### spec

`S`

#### Returns

`Promise`\<`S`\>

***

### destroy()

> **destroy**(`spec`): `void`

Defined in: [src/core/contracts/EngineCore.ts:265](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L265)

Remove a posse de `spec` sobre o objeto de GPU. O objeto é destruído quando nenhuma spec dona resta; specs
de mesmo conteúdo criadas por outros donos continuam válidas. `spec` que não é dona não altera nada.

#### Parameters

##### spec

`ResourceSpec`

#### Returns

`void`

***

### framesInFlight()

> **framesInFlight**(): `number`

Defined in: [src/core/contracts/EngineCore.ts:296](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L296)

Quadros submetidos cuja execução na GPU ainda não terminou (`queue.onSubmittedWorkDone`). O laço usa para não
acumular quadros na GPU sem limite (`ApplicationOptions.maxFramesInFlight`). Device perdido ou `shutdown`
zeram a contagem.

#### Returns

`number`

***

### initialize()

> **initialize**(`surface?`, `canvasOptions?`, `device?`, `platform?`): `Promise`\<`void`\>

Defined in: [src/core/contracts/EngineCore.ts:152](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L152)

Adquire GPUAdapter + GPUDevice (assíncrono) pelo adaptador de plataforma (`platform`, spec 038: obrigatório na
primeira vez, guardado para a recuperação) aplicando `device` (potência, features, limites) e configura a
superfície de apresentação (`surface`: o canvas, a janela ou a textura) com `canvasOptions`. As opções ficam guardadas e são reaplicadas em `requestRecover` e
`reconfigureCanvas`. Idempotente quando o device já existe — apenas reaplica canvas/opções de canvas.
Rejeita se WebGPU não está disponível ou se uma feature de `device.requiredFeatures` falta no adaptador
(a mensagem nomeia a feature).

#### Parameters

##### surface?

[`PresentationSurface`](PresentationSurface.md)

##### canvasOptions?

`CanvasOptions`

##### device?

[`DeviceOptions`](DeviceOptions.md)

##### platform?

[`PlatformAdapter`](PlatformAdapter.md)\<`unknown`\>

#### Returns

`Promise`\<`void`\>

***

### lastFrameStats()

> **lastFrameStats**(): [`FrameStats`](FrameStats.md)

Defined in: [src/core/contracts/EngineCore.ts:225](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L225)

Estatísticas da última gravação submetida (draws, dispatches, passes) e a leitura de
GPU mais recente resolvida até o momento da chamada (`gpuTimeMs`, com defasagem de
1–3 quadros; `gpuFrame` diz a que quadro pertence).

#### Returns

[`FrameStats`](FrameStats.md)

***

### memoryUsage()

> **memoryUsage**(`topN?`): `MemoryUsageReport`

Defined in: [src/core/contracts/EngineCore.ts:205](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L205)

Bytes alocados em GPU memory neste momento. `top` lista as N maiores
allocations (default N=5) para diagnóstico. Apenas buffers e texturas
contam — pipelines/layouts/bindgroups são reportados como kind='other'
com bytes=0 (custo opaco).

#### Parameters

##### topN?

`number`

#### Returns

`MemoryUsageReport`

***

### onDeviceLost()

> **onDeviceLost**(`handler`): () => `void`

Defined in: [src/core/contracts/EngineCore.ts:190](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L190)

Registra handler para device-lost. Disparado quando o GPU device é perdido
(driver crash, reset, OOM no nível de driver). Retorna função de unsubscribe.
Após o handler rodar, o store interno está limpo e o próximo `initialize()`
(ou `requestRecover()`) cria um device novo.

#### Parameters

##### handler

`DeviceLostHandler`

#### Returns

() => `void`

***

### onFrameRetired()

> **onFrameRetired**(`handler`): () => `void`

Defined in: [src/core/contracts/EngineCore.ts:302](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L302)

Registra handler chamado quando a contagem de `framesInFlight()` cai: um quadro submetido terminou na GPU, ou
a contagem foi zerada (device perdido, `shutdown`). Recebe a contagem nova. Quem espera espaço na GPU reage a
isto em vez de consultar a contagem a cada quadro. Retorna função de unsubscribe.

#### Parameters

##### handler

(`framesInFlight`) => `void`

#### Returns

() => `void`

***

### readback()

> **readback**(`spec`): `Promise`\<`ArrayBuffer`\>

Defined in: [src/core/contracts/EngineCore.ts:270](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L270)

Lê staging buffer GPU → CPU (mapAsync + getMappedRange + unmap).
Retorna ArrayBuffer com cópia dos dados.

#### Parameters

##### spec

[`StagingBufferSpec`](StagingBufferSpec.md)

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### readCanvas()

> **readCanvas**(): `Promise`\<[`CanvasPixels`](CanvasPixels.md)\>

Defined in: [src/core/contracts/EngineCore.ts:278](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L278)

Lê da GPU o quadro apresentado no canvas (spec 034): copia a textura atual do canvas para um buffer de leitura e
devolve os pixels. Chame na mesma tarefa do quadro (a textura do canvas só vale até a tarefa ceder) e com o canvas
configurado com `capture: true`. Para ferramentas — o motor nunca lê de volta por quadro por conta própria.

#### Returns

`Promise`\<[`CanvasPixels`](CanvasPixels.md)\>

#### Throws

Error sem canvas, sem `capture` ou depois de a tarefa do quadro ceder.

***

### reconfigureCanvas()

> **reconfigureCanvas**(`options?`): `void`

Defined in: [src/core/contracts/EngineCore.ts:162](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L162)

Re-configura o canvas swapchain (chamado após resize). Não recria o device. Sem `options`, reaplica as
opções de canvas guardadas (as de `initialize`); com `options`, elas passam a ser as guardadas.

#### Parameters

##### options?

`CanvasOptions`

#### Returns

`void`

***

### record()

#### Call Signature

> **record**(`body`): `void`

Defined in: [src/core/contracts/EngineCore.ts:286](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L286)

Abre um command encoder, passa um Frame para o body emitir comandos,
fecha o encoder ao final do callback. Use `frame.compute(...)` ou
`frame.render(target, ...)` dentro do body. Após record retornar,
chame `submit()` para enfileirar na queue GPU.

##### Parameters

###### body

(`frame`) => `void`

##### Returns

`void`

#### Call Signature

> **record**(`label`, `body`): `void`

Defined in: [src/core/contracts/EngineCore.ts:288](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L288)

Variante com label (aparece em DevTools/RenderDoc para identificar o command buffer).

##### Parameters

###### label

`string`

###### body

(`frame`) => `void`

##### Returns

`void`

***

### requestRecover()

> **requestRecover**(`surface?`, `options?`): `Promise`\<`void`\>

Defined in: [src/core/contracts/EngineCore.ts:197](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L197)

Recupera após device-lost: cria um GPUAdapter+GPUDevice novos com as `DeviceOptions` guardadas e re-attacha
o canvas (o informado ou o anterior) com as `CanvasOptions` guardadas — ou com `options`, que passam a ser
as guardadas. Resources cacheados precisam ser recriados pelos sistemas consumidores.

#### Parameters

##### surface?

[`PresentationSurface`](PresentationSurface.md)

##### options?

`CanvasOptions`

#### Returns

`Promise`\<`void`\>

***

### setFrameProfiling()

> **setFrameProfiling**(`enabled`, `capacity?`, `granularity?`): `void`

Defined in: [src/core/contracts/EngineCore.ts:215](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L215)

Liga/desliga o profiling de GPU por quadro: `lastFrameStats().gpuTimeMs` passa a ser preenchido. Com
`granularity: 'passes'` (padrão), todo passe sem timestamps explícitos recebe um par automático e `stagesNs`
traz o tempo de cada um; com `'frame'`, só dois timestamps por gravação (um passe vazio no início e outro no
fim) medem o total — sem o custo de amostrar em cada passe, que em quadros com dezenas de passes (física)
pesa no próprio tempo medido. `capacity` = timestamps por quadro (default 256 = 128 passes). No-op com aviso
único quando o device não tem `timestamp-query`.

#### Parameters

##### enabled

`boolean`

##### capacity?

`number`

##### granularity?

[`FrameProfilingGranularity`](../type-aliases/FrameProfilingGranularity.md)

#### Returns

`void`

***

### shaderMessages()

> **shaderMessages**(`spec`): `Promise`\<readonly [`ShaderMessage`](ShaderMessage.md)[]\>

Defined in: [src/core/contracts/EngineCore.ts:315](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L315)

Compila o fonte de `spec` à parte (sem registrar o módulo) e devolve as mensagens do compilador. Erros de
validação ficam no escopo da chamada — não chegam ao device como erro não capturado. Quem aceita código de fora
(funções de ponto de extensão) confere antes de criar o pipeline.

#### Parameters

##### spec

[`ShaderModuleSpec`](ShaderModuleSpec.md)

#### Returns

`Promise`\<readonly [`ShaderMessage`](ShaderMessage.md)[]\>

***

### shutdown()

> **shutdown**(): `void`

Defined in: [src/core/contracts/EngineCore.ts:320](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L320)

Destrói o GPU device + libera todos os recursos. Após shutdown, o core
volta a estado uninitialized — pode ser re-inicializado via `initialize()`.

#### Returns

`void`

***

### submit()

> **submit**(): `void`

Defined in: [src/core/contracts/EngineCore.ts:290](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L290)

Enfileira o último command buffer construído por `record()` na queue GPU.

#### Returns

`void`

***

### takeFrameTimings()

> **takeFrameTimings**(): readonly [`FrameGpuTiming`](FrameGpuTiming.md)[]

Defined in: [src/core/contracts/EngineCore.ts:231](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L231)

Leituras de tempo de GPU chegadas desde a última chamada, cada uma uma única vez, na ordem de chegada (spec
034). Vazio sem profiling por quadro ou sem `timestamp-query`.

#### Returns

readonly [`FrameGpuTiming`](FrameGpuTiming.md)[]

***

### withErrorScope()

> **withErrorScope**\<`T`\>(`filter`, `body`): `Promise`\<`T`\>

Defined in: [src/core/contracts/EngineCore.ts:309](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L309)

Wrap um body em error scope GPU. Erros (validation/oom/internal) viram
Promise rejection ao invés de logs no console. Útil para captureErrors
em runtime via Application option.

#### Type Parameters

##### T

`T`

#### Parameters

##### filter

`GPUErrorFilter`

##### body

() => `T` \| `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

***

### write()

> **write**(`spec`, `data`, `offset?`): `void`

Defined in: [src/core/contracts/EngineCore.ts:252](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L252)

Escreve dados CPU → GPU buffer no offset especificado (default 0).

#### Parameters

##### spec

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md)

##### data

`ArrayBufferView`

##### offset?

`number`

#### Returns

`void`

***

### writeTexture()

> **writeTexture**(`spec`, `data`, `layout`, `size`): `void`

Defined in: [src/core/contracts/EngineCore.ts:254](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/EngineCore.ts#L254)

Escreve dados CPU → GPU texture (uma sub-região definida por size+layout).

#### Parameters

##### spec

[`TextureSpec`](TextureSpec.md)

##### data

`ArrayBufferView`

##### layout

`GPUTexelCopyBufferLayout`

##### size

`GPUExtent3DStrict`

#### Returns

`void`
