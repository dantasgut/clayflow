[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EventMap

# Interface: EventMap

Defined in: [src/scene/events/EventMap.ts:337](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L337)

Tipo central que mapeia nome do evento → payload. Usado pelo `EventBus`
para tipar `on(name, handler)` e `emit(name, payload)` em compile-time.

Adicionar evento novo:
  1. Defina o payload interface acima.
  2. Adicione `name: PayloadType` aqui.
  3. Re-export do payload em `events/index.ts`.

## Properties

### adaptiveUnavailable

> **adaptiveUnavailable**: `AdaptiveUnavailablePayload`

Defined in: [src/scene/events/EventMap.ts:362](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L362)

A malha adaptativa de uma superfície ficou no nível máximo (sem desenho indireto no device; spec 010).

***

### bindGroupReplaced

> **bindGroupReplaced**: `BindGroupReplacedEvent`

Defined in: [src/scene/events/EventMap.ts:358](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L358)

A C2 recriou um bind group de um pipeline de Flow porque uma fonte foi recriada.

***

### canvasReconfigured

> **canvasReconfigured**: `CanvasReconfiguredPayload`

Defined in: [src/scene/events/EventMap.ts:374](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L374)

Application emite após resize do canvas — flows recriam textures.

***

### consumerMissing

> **consumerMissing**: [`ConsumerMissingPayload`](ConsumerMissingPayload.md)

Defined in: [src/scene/events/EventMap.ts:412](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L412)

A C2 emite (uma vez por Flow, pipeline e binding) quando um binding de um Flow ativo segue sem fonte (H2).

***

### deviceLost

> **deviceLost**: `DeviceLostPayload`

Defined in: [src/scene/events/EventMap.ts:386](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L386)

Core emite quando GPU device é perdido — recovery via Application.requestNewDevice.

***

### deviceRecovered

> **deviceRecovered**: `DeviceRecoveredPayload`

Defined in: [src/scene/events/EventMap.ts:388](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L388)

Application emite após recovery bem-sucedido.

***

### engineError

> **engineError**: `EngineErrorPayload`

Defined in: [src/scene/events/EventMap.ts:384](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L384)

ExecutionSystem emite quando captureErrors=true e há erro WebGPU.

***

### enginePreparing

> **enginePreparing**: [`EnginePreparingPayload`](EnginePreparingPayload.md)

Defined in: [src/scene/events/EventMap.ts:408](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L408)

A C2 emite quando o motor passa a ter trabalho pendente (compilação, conferência, troca, fonte ausente).

***

### engineReady

> **engineReady**: [`EngineReadyPayload`](EngineReadyPayload.md)

Defined in: [src/scene/events/EventMap.ts:410](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L410)

A C2 emite quando não resta trabalho pendente: o quadro sai completo (spec 034).

***

### entitiesInserted

> **entitiesInserted**: [`EntitiesInsertedPayload`](EntitiesInsertedPayload.md)

Defined in: [src/scene/events/EventMap.ts:376](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L376)

World emite quando entidades são inseridas — flows atualizam seus conjuntos de entidades.

***

### entitiesRecomposed

> **entitiesRecomposed**: `EntitiesRecomposedPayload`

Defined in: [src/scene/events/EventMap.ts:380](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L380)

World emite quando a composição de entidades inseridas muda (`attach`/`detach`).

***

### entitiesRemoved

> **entitiesRemoved**: [`EntitiesRemovedPayload`](EntitiesRemovedPayload.md)

Defined in: [src/scene/events/EventMap.ts:378](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L378)

World emite quando entidades removidas — flows limpam slots cacheados.

***

### extensionRejected

> **extensionRejected**: [`ExtensionRejectedPayload`](ExtensionRejectedPayload.md)

Defined in: [src/scene/events/EventMap.ts:360](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L360)

O compilador rejeitou o código de uma função de ponto de extensão (spec 009).

***

### flowReady

> **flowReady**: `ReadyEvent`\<`FlowReadyPayload`\>

Defined in: [src/scene/events/EventMap.ts:350](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L350)

A C2 deixou um Flow pronto (slots resolvidos, pipelines compilados) — entra no quadro.

***

### flowSuspended

> **flowSuspended**: `ReadyEvent`\<[`FlowSuspendedPayload`](FlowSuspendedPayload.md)\>

Defined in: [src/scene/events/EventMap.ts:352](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L352)

Um Flow saiu de `ready` — deixa o quadro.

***

### frameComplete

> **frameComplete**: [`FrameCompleteEvent`](FrameCompleteEvent.md)

Defined in: [src/scene/events/EventMap.ts:370](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L370)

ExecutionSystem emite após record+submit — fim do frame.

***

### frameRecording

> **frameRecording**: [`FrameRecordingEvent`](FrameRecordingEvent.md)

Defined in: [src/scene/events/EventMap.ts:368](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L368)

ExecutionSystem emite antes de gravar o quadro — ResourceSystem envia os recursos sujos.

***

### frameRetired

> **frameRetired**: [`FrameRetiredPayload`](FrameRetiredPayload.md)

Defined in: [src/scene/events/EventMap.ts:372](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L372)

Core emite quando um quadro submetido termina na GPU — há espaço para mais um.

***

### frameTick

> **frameTick**: [`FrameTickEvent`](FrameTickEvent.md)

Defined in: [src/scene/events/EventMap.ts:364](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L364)

`Application.step()`/`GameLoop` emitem a cada quadro, depois de `time.advance()`.

***

### globalIlluminationReady

> **globalIlluminationReady**: `GlobalIlluminationReadyPayload`

Defined in: [src/scene/events/EventMap.ts:406](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L406)

As sondas da iluminação global emitem quando os kernels da composição atual ficam prontos (spec 033).

***

### globalIlluminationUnsupported

> **globalIlluminationUnsupported**: `GlobalIlluminationUnsupportedPayload`

Defined in: [src/scene/events/EventMap.ts:397](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L397)

As sondas da iluminação global emitem (uma vez) quando o dispositivo não as comporta (spec 033); o estágio padrão,
quando a estrutura de raios não coube e há uma `GlobalIllumination` na cena (spec 034, T046).

***

### gpuFrameTimed

> **gpuFrameTimed**: [`GpuFrameTimedPayload`](GpuFrameTimedPayload.md)

Defined in: [src/scene/events/EventMap.ts:414](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L414)

A C2 emite uma vez por quadro medido, quando a leitura de tempo de GPU dele chega (spec 034).

***

### keyDown

> **keyDown**: [`KeyEvent`](../../../presentation/interfaces/KeyEvent.md)

Defined in: [src/presentation/input/InputEvents.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L35)

Tecla pressionada (`Input`, Camada 4).

***

### keyUp

> **keyUp**: [`KeyEvent`](../../../presentation/interfaces/KeyEvent.md)

Defined in: [src/presentation/input/InputEvents.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L37)

Tecla solta.

***

### memoryWarning

> **memoryWarning**: `MemoryWarningPayload`

Defined in: [src/scene/events/EventMap.ts:390](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L390)

Application emite quando memoryBudgetMB threshold é cruzado.

***

### pointerDown

> **pointerDown**: [`PointerInputEvent`](../../../presentation/interfaces/PointerInputEvent.md)

Defined in: [src/presentation/input/InputEvents.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L39)

Botão do ponteiro pressionado.

***

### pointerMove

> **pointerMove**: [`PointerInputEvent`](../../../presentation/interfaces/PointerInputEvent.md)

Defined in: [src/presentation/input/InputEvents.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L43)

Ponteiro movido.

***

### pointerUp

> **pointerUp**: [`PointerInputEvent`](../../../presentation/interfaces/PointerInputEvent.md)

Defined in: [src/presentation/input/InputEvents.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L41)

Botão do ponteiro solto.

***

### poolCreated

> **poolCreated**: [`PoolCreatedPayload`](PoolCreatedPayload.md)

Defined in: [src/scene/events/EventMap.ts:354](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L354)

A C2 criou um pool — registros de Flow com esse `bodyType` são instanciados.

***

### poolReallocated

> **poolReallocated**: `PoolReallocatedEvent`

Defined in: [src/scene/events/EventMap.ts:356](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L356)

Pool teve buffer realocado (capacity 2× growth) — flows invalidam bindings.

***

### poolWritten

> **poolWritten**: `PoolWrittenEvent`

Defined in: [src/scene/events/EventMap.ts:346](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L346)

ResourceSystem enviou faixas de slots de um pool (um evento por pool por rodada de envio).

***

### presentationFallback

> **presentationFallback**: `PresentationFallbackPayload`

Defined in: [src/scene/events/EventMap.ts:392](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L392)

A apresentação emite (uma vez) quando a saída pedida não é suportada e cai no padrão (spec 011).

***

### profilerStats

> **profilerStats**: [`ProfilerStatsPayload`](ProfilerStatsPayload.md)

Defined in: [src/scene/events/EventMap.ts:382](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L382)

DebugFlow emite (throttled 250ms) com FPS + frame time + stages timestamps.

***

### raySceneUnsupported

> **raySceneUnsupported**: `RaySceneUnsupportedPayload`

Defined in: [src/scene/events/EventMap.ts:399](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L399)

A estrutura de raios emite (uma vez) quando não cabe no dispositivo (spec 034, T046).

***

### refractionUnsupported

> **refractionUnsupported**: `RefractionUnsupportedPayload`

Defined in: [src/scene/events/EventMap.ts:404](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L404)

O estágio padrão emite (uma vez) quando a estrutura de raios não coube e a cena tem um transmissivo com a refração
ligada no renderizador (spec 034, T046).

***

### resourceDirty

> **resourceDirty**: `ReadyEvent`\<`ResourceDirtyPayload`\>

Defined in: [src/scene/events/EventMap.ts:348](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L348)

App marcou Resource como modificado — re-upload pendente.

***

### resourceReady

> **resourceReady**: `ReadyEvent`\<`ResourceReadyPayload`\>

Defined in: [src/scene/events/EventMap.ts:344](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L344)

ResourceSystem alocou ou enviou um Resource com objetos próprios (descritores individuais). Dado em pool é
anunciado por `poolWritten`, um por pool.

***

### resourcesChanged

> **resourcesChanged**: `ChangedEvent`\<[`Resource`](Resource.md)\>

Defined in: [src/scene/events/EventMap.ts:339](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L339)

World.insert/remove disparam — added/removed Resources.

***

### timeDropped

> **timeDropped**: [`TimeDroppedEvent`](TimeDroppedEvent.md)

Defined in: [src/scene/events/EventMap.ts:366](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/events/EventMap.ts#L366)

`Time` emite quando o teto de passos por quadro descarta tempo de física.

***

### wheel

> **wheel**: [`WheelInputEvent`](../../../presentation/interfaces/WheelInputEvent.md)

Defined in: [src/presentation/input/InputEvents.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/InputEvents.ts#L45)

Roda do mouse.
