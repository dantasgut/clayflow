[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CameraFlow

# Class: CameraFlow

Defined in: [elements/scene/flows/CameraFlow.ts:53](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L53)

Estágio de câmera (spec 007, research R10) — produz, na GPU, view, projection, viewProjection e a posição de cada
câmera a partir dos seus parâmetros (`Camera`) e da matriz de mundo do seu `Transform` (`WorldTransform`, composta
antes na mesma fase), no pool `CameraMatrices`. A razão de aspecto das câmeras `aspectMode: 'canvas'` vem do canvas
(uniform do estágio, escrito quando o tamanho muda) — a CPU não calcula matriz de câmera.

Fase `transform`, prioridade abaixo do `TransformFlow`. Roda todo quadro com câmeras (poucas threads). Uma `Camera`
sem `Transform` na entidade é erro (nomeia a entidade).

## Extends

- `Flow`\<[`CameraSlots`](../interfaces/CameraSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new CameraFlow**(`ctx`): `CameraFlow`

Defined in: [elements/scene/flows/CameraFlow.ts:84](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L84)

#### Parameters

##### ctx

`FlowContext`

#### Returns

`CameraFlow`

#### Overrides

`Flow<CameraSlots, 'idle'>.constructor`

## Properties

### bindings

> `readonly` **bindings**: `object`

Defined in: [elements/scene/flows/CameraFlow.ts:71](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L71)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### compose

> `readonly` **compose**: `UniformBufferSpec`

Parâmetros do estágio (`CameraComposeParams`).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [elements/scene/flows/CameraFlow.ts:75](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L75)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: readonly `Schema`[] = `[]`

Defined in: [scene/flows/Flow.ts:69](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/flows/Flow.ts#L69)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Inherited from

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/scene/flows/CameraFlow.ts:56](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L56)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`CameraSlots`](../interfaces/CameraSlots.md)

Defined in: [elements/scene/flows/CameraFlow.ts:55](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L55)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/scene/flows/CameraFlow.ts:76](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L76)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"CameraFlow"` = `'CameraFlow'`

Defined in: [elements/scene/flows/CameraFlow.ts:54](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L54)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/scene/flows/CameraFlow.ts:125](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L125)

Grava a composição das câmeras vivas.

#### Parameters

##### frame

`Frame`

##### bound

`BoundFlow`\<[`CameraSlots`](../interfaces/CameraSlots.md)\>

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/scene/flows/CameraFlow.ts:135](https://github.com/dantasgut/clayflow/blob/cf3219b12b1efe68ec0c4bb1126f4798a2caa0e4/src/elements/scene/flows/CameraFlow.ts#L135)

Libera o uniform de parâmetros.

#### Returns

`void`

#### Overrides

`Flow.dispose`
