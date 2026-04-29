[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Application

# Class: Application

Defined in: [presentation/app/Application.ts:47](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L47)

Application — bootstrap das 4 camadas da engine sobre um `<canvas>`.

Ciclo de vida:
  1. `await Application.create({ canvas })` adquire device/queue, configura
     swapchain, instancia `World`/`EventBus`/`ResourceSystem`/`FlowRegistry`,
     e registra defaults (`ShadowFlow + ForwardFlow + PostFlow + UIFlow + DebugFlow`).
  2. `app.world.insert(entity)` para cada entidade da cena. Resources
     indexados disparam alocação de buffers/binds reativamente.
  3. `app.start()` inicia o `GameLoop` (RAF), que emite `frameTick` e cada
     Flow ready dispatcha seus passes dentro de `core.record(...)` + `submit()`.
  4. `app.stop()` pausa o RAF; `app.dispose()` desfaz event listeners.

Resize: por padrão (`autoResize: true` em browser) anexa um listener em
`window.resize` debounced 100ms que reconfigura o canvas + emite
`canvasReconfigured`, e os flows recriam textures size-dependent via
`Flow.onCanvasResized`.

## Properties

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [presentation/app/Application.ts:52](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L52)

***

### defaults

> `readonly` **defaults**: [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [presentation/app/Application.ts:51](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L51)

***

### flows

> `readonly` **flows**: `FlowRegistry`

Defined in: [presentation/app/Application.ts:49](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L49)

***

### time

> `readonly` **time**: [`Time`](Time.md)

Defined in: [presentation/app/Application.ts:50](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L50)

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/app/Application.ts:48](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L48)

## Accessors

### consumers

#### Get Signature

> **get** **consumers**(): `ConsumerResolverRegistry`

Defined in: [presentation/app/Application.ts:144](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L144)

##### Returns

`ConsumerResolverRegistry`

***

### core

#### Get Signature

> **get** **core**(): `GpuEngineCore`

Defined in: [presentation/app/Application.ts:141](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L141)

##### Returns

`GpuEngineCore`

***

### events

#### Get Signature

> **get** **events**(): `DefaultEventBus`

Defined in: [presentation/app/Application.ts:142](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L142)

##### Returns

`DefaultEventBus`

***

### executionSystem

#### Get Signature

> **get** **executionSystem**(): `ExecutionSystem`

Defined in: [presentation/app/Application.ts:146](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L146)

##### Returns

`ExecutionSystem`

***

### layoutInferencer

#### Get Signature

> **get** **layoutInferencer**(): `LayoutInferencer`

Defined in: [presentation/app/Application.ts:145](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L145)

##### Returns

`LayoutInferencer`

***

### resources

#### Get Signature

> **get** **resources**(): `ResourceSystem`

Defined in: [presentation/app/Application.ts:143](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L143)

##### Returns

`ResourceSystem`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [presentation/app/Application.ts:129](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L129)

#### Returns

`void`

***

### handleResize()

> **handleResize**(): `void`

Defined in: [presentation/app/Application.ts:108](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L108)

Re-sincroniza canvas.width/height com clientWidth/clientHeight × DPR,
reconfigura o swapchain do core, e emite `canvasReconfigured` para
que Flows recriem suas textures size-dependent.

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/Application.ts:99](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L99)

#### Returns

`boolean`

***

### start()

> **start**(): `void`

Defined in: [presentation/app/Application.ts:91](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L91)

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/Application.ts:95](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L95)

#### Returns

`void`

***

### create()

> `static` **create**(`options`): `Promise`\<`Application`\>

Defined in: [presentation/app/Application.ts:75](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/app/Application.ts#L75)

#### Parameters

##### options

[`ApplicationOptions`](../interfaces/ApplicationOptions.md)

#### Returns

`Promise`\<`Application`\>
