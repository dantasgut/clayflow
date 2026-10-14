[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ShadowMatrixFlow

# Class: ShadowMatrixFlow

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:50](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L50)

Estágio da matriz de sombra (spec 007, research R11) — produz, na GPU, a matriz luz-vista-projeção de cada
`DirectionalLight` que projeta sombra a partir da direção dela (pool `Light`), no pool `ShadowMatrix` (segundo
descritor do `ShadowMap`, mesmo slot), que o estágio de sombra e o render principal leem. A CPU não calcula a
matriz nem acompanha mudanças da luz: a direção chega ao pool pelo envio da C2 e o kernel a lê.

Fase `transform`, depois do `CameraFlow`. Roda todo quadro com luzes que projetam (poucas threads).

## Extends

- `Flow`\<[`ShadowMatrixSlots`](../interfaces/ShadowMatrixSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ShadowMatrixFlow**(`ctx`): `ShadowMatrixFlow`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:79](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L79)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`ShadowMatrixFlow`

#### Overrides

`Flow<ShadowMatrixSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `object`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:67](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L67)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### shadow\_params

> `readonly` **shadow\_params**: `UniformBufferSpec`

Parâmetros do estágio (`ShadowMatrixParams`).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:71](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L71)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:53](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L53)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`ShadowMatrixSlots`](../interfaces/ShadowMatrixSlots.md)

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:52](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L52)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:72](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L72)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"ShadowMatrixFlow"` = `'ShadowMatrixFlow'`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:51](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L51)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:108](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L108)

Grava o cálculo das matrizes das luzes vivas.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`ShadowMatrixSlots`](../interfaces/ShadowMatrixSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/scene/flows/ShadowMatrixFlow.ts:118](https://github.com/dantasgut/clayflow/blob/4248630d571e37ebe4bb44d5532f082da6e048b0/src/elements/scene/flows/ShadowMatrixFlow.ts#L118)

Libera o uniform de parâmetros.

#### Returns

`void`

#### Overrides

`Flow.dispose`
