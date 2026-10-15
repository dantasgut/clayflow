[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / CameraFlow

# Class: CameraFlow

Defined in: [elements/scene/flows/CameraFlow.ts:83](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L83)

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

Defined in: [elements/scene/flows/CameraFlow.ts:146](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L146)

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

Defined in: [elements/scene/flows/CameraFlow.ts:102](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L102)

Bindings privados iniciais por nome de variável WGSL (uniforms por passo, temporários do algoritmo).

#### camera\_fn\_group

> `readonly` **camera\_fn\_group**: `ResolvedSource`

Trecho, tempo e razão do canvas de cada grupo de função (offset dinâmico).

#### camera\_fn\_list

> `readonly` **camera\_fn\_list**: `StorageBufferSpec`

(slot da câmera, slot do Transform, slot do registro) das câmeras com função, agrupadas por função.

#### compose

> `readonly` **compose**: `UniformBufferSpec`

Parâmetros do estágio (`CameraComposeParams`).

#### Overrides

`Flow.bindings`

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [elements/scene/flows/CameraFlow.ts:110](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L110)

Estado inicial do algoritmo.

#### Overrides

`Flow.initialState`

***

### listens

> `readonly` **listens**: `StructSchema`[]

Defined in: [elements/scene/flows/CameraFlow.ts:101](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L101)

Schemas cujos `resourceReady` o Flow recebe como evento.

#### Overrides

`Flow.listens`

***

### pipelines

> `readonly` **pipelines**: readonly `PipelineDescriptor`[]

Defined in: [elements/scene/flows/CameraFlow.ts:86](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L86)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

`Flow.pipelines`

***

### slots

> `readonly` **slots**: [`CameraSlots`](../interfaces/CameraSlots.md)

Defined in: [elements/scene/flows/CameraFlow.ts:85](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L85)

Slots consumidos, por nome.

#### Overrides

`Flow.slots`

***

### transitions

> `protected` `readonly` **transitions**: `FlowTransitions`\<`"idle"`, `Ctx`\>

Defined in: [elements/scene/flows/CameraFlow.ts:111](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L111)

Tabela de transições (estado × evento).

#### Overrides

`Flow.transitions`

***

### type

> `readonly` **type**: `"CameraFlow"` = `'CameraFlow'`

Defined in: [elements/scene/flows/CameraFlow.ts:84](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L84)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

`Flow.type`

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): `FlowLifecycle`

Defined in: [scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L79)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

`FlowLifecycle`

#### Inherited from

`Flow.lifecycle`

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/scene/flows/Flow.ts#L84)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

`Flow.state`

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [elements/scene/flows/CameraFlow.ts:222](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L222)

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

Defined in: [elements/scene/flows/CameraFlow.ts:248](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/scene/flows/CameraFlow.ts#L248)

Libera o uniform de parâmetros e as listas das funções.

#### Returns

`void`

#### Overrides

`Flow.dispose`
