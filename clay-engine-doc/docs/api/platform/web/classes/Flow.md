[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / Flow

# Abstract Class: Flow\<TSlots, S\>

Defined in: [src/scene/flows/Flow.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L57)

Unidade de trabalho do quadro (um estágio): declara o que consome (`slots`, `pipelines` cujos shaders requerem
recursos declarados, fontes privadas por recurso) e grava comandos em `dispatch`. A Camada 2 resolve os slots, infere layouts do WGSL, cria
pipelines e bind groups, mantém tudo atualizado e entrega o resultado (`BoundFlow`) a cada quadro. O Flow nunca
cria layout nem bind group de dado consumido.

- **Estado**: `S` é o estado próprio do algoritmo; muda só pela tabela `transitions` em reação a eventos da C2
  (`FlowEvent`). Não há método público de avanço de estado. O `run` de uma transição é onde recursos privados são
  criados ou recriados e religados (`ctx.bind`).
- **Gravação**: `dispatch(frame, bound)` só grava passes; não prepara pipelines, layouts nem bind groups.
- **Registro**: por factory, com fase, tipo de corpo e prioridade (`FlowRegistry.register`).

## Extended by

- [`ShadowFlow`](../../../presentation/classes/ShadowFlow.md)
- [`DebugFlow`](../../../presentation/classes/DebugFlow.md)
- [`TransformFlow`](../../../elements/classes/TransformFlow.md)
- [`CameraFlow`](../../../elements/classes/CameraFlow.md)
- [`ShadowMatrixFlow`](../../../elements/classes/ShadowMatrixFlow.md)
- [`SkyFlow`](../../../elements/classes/SkyFlow.md)
- [`RaySceneFlow`](../../../elements/classes/RaySceneFlow.md)
- [`ProbeFlow`](../../../elements/classes/ProbeFlow.md)
- [`CausticsFlow`](../../../elements/classes/CausticsFlow.md)
- [`FluidFieldFlow`](../../../elements/classes/FluidFieldFlow.md)
- [`FroxelFlow`](../../../elements/classes/FroxelFlow.md)
- [`SurfaceFlow`](../../../elements/classes/SurfaceFlow.md)
- [`LCPFlow`](../../../elements/classes/LCPFlow.md)
- [`XPBDFlow`](../../../elements/classes/XPBDFlow.md)
- [`FEMFlow`](../../../elements/classes/FEMFlow.md)
- [`MPMFlow`](../../../elements/classes/MPMFlow.md)
- [`PBFFlow`](../../../elements/classes/PBFFlow.md)
- [`SPHFlow`](../../../elements/classes/SPHFlow.md)
- [`SoftSurfaceFlow`](../../../elements/classes/SoftSurfaceFlow.md)
- [`SurfaceColliderFlow`](../../../elements/classes/SurfaceColliderFlow.md)
- [`EnergyFlow`](../../../elements/classes/EnergyFlow.md)
- [`SoftEnergyFlow`](../../../elements/classes/SoftEnergyFlow.md)
- [`EmitterFlow`](../../../elements/classes/EmitterFlow.md)
- [`DiffuseFlow`](../../../elements/classes/DiffuseFlow.md)
- [`RenderFlow`](RenderFlow.md)
- [`GraphFlow`](GraphFlow.md)

## Type Parameters

### TSlots

`TSlots` *extends* [`SlotMap`](../type-aliases/SlotMap.md) = [`SlotMap`](../type-aliases/SlotMap.md)

Declarações de slots (`slot.*`).

### S

`S` *extends* `string` = `string`

Estados próprios do Flow.

## Constructors

### Constructor

> **new Flow**\<`TSlots`, `S`\>(): `Flow`\<`TSlots`, `S`\>

#### Returns

`Flow`\<`TSlots`, `S`\>

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

***

### initialState

> `abstract` `protected` `readonly` **initialState**: `S`

Defined in: [src/scene/flows/Flow.ts:86](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L86)

Estado inicial do algoritmo.

***

### listens

> `readonly` **listens**: readonly [`Listened`](../type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../interfaces/PipelineDescriptor.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L77)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

***

### slots

> `abstract` `readonly` **slots**: `TSlots`

Defined in: [src/scene/flows/Flow.ts:75](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L75)

Slots consumidos, por nome.

***

### transitions

> `abstract` `protected` `readonly` **transitions**: [`FlowTransitions`](../type-aliases/FlowTransitions.md)\<`S`, [`TransitionContext`](../interfaces/TransitionContext.md)\<`TSlots`\>\>

Defined in: [src/scene/flows/Flow.ts:88](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L88)

Tabela de transições (estado × evento).

***

### type

> `abstract` `readonly` **type**: `string`

Defined in: [src/scene/flows/Flow.ts:73](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L73)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../type-aliases/FlowLifecycle.md)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

## Methods

### dispatch()

> `abstract` **dispatch**(`frame`, `bound`): `void`

Defined in: [src/scene/flows/Flow.ts:104](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L104)

Grava os comandos do quadro. Chamado só quando `lifecycle === 'ready'`.

#### Parameters

##### frame

[`Frame`](../interfaces/Frame.md)

##### bound

[`BoundFlow`](../interfaces/BoundFlow.md)\<`TSlots`\>

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/Flow.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L107)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`
