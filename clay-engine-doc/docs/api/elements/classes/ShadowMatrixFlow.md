[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ShadowMatrixFlow

# Class: ShadowMatrixFlow

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L76)

Estágio do referencial do mapa de sombra virtual (spec 007, research R11; spec 034, T060) — produz, na GPU, para cada
`DirectionalLight` que projeta sombra, a base do espaço da luz a partir da direção dela (pool `Light`), a câmera nesse
espaço e os níveis ativos, na série `ShadowMatrix` (segundo descritor do `ShadowMap`, mesmo slot), que o estágio de
sombra e o render principal leem. O referencial do quadro anterior (atraso 1) diz se o cache das páginas vale. A CPU
não acompanha a luz: a direção chega ao pool pelo envio da C2 e o kernel a lê.

Com o deslocamento da amostra dentro do pixel (`TemporalAntialiasing` temporal ou acumulação; spec 034, R3/R6), a
sombra entra na mesma sequência (o mesmo comprimento; as dimensões 5, 7 e 11 do Halton, que não se alinham ao
deslocamento da câmera, de bases 2 e 3): as amostras da penumbra andam dentro do texel e o padrão gira a cada quadro —
o acúmulo faz a média. Sem ele, o padrão parado.

Fase `transform`, depois do `CameraFlow`. Roda todo quadro com luzes que projetam (poucas threads).

## Extends

- [`Flow`](../../platform/web/classes/Flow.md)\<[`ShadowMatrixSlots`](../interfaces/ShadowMatrixSlots.md), `"idle"`\>

## Constructors

### Constructor

> **new ShadowMatrixFlow**(`ctx`): `ShadowMatrixFlow`

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L103)

#### Parameters

##### ctx

[`FlowContext`](../../platform/web/interfaces/FlowContext.md)

#### Returns

`ShadowMatrixFlow`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`constructor`](../../platform/web/classes/Flow.md#constructor)

## Properties

### bindings

> `readonly` **bindings**: [`BindingSources`](../../platform/web/type-aliases/BindingSources.md)

Defined in: [src/scene/flows/Flow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L79)

Bindings privados iniciais por recurso declarado (uniforms por passo, temporários do algoritmo).

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`bindings`](../../platform/web/classes/Flow.md#bindings)

***

### initialState

> `protected` `readonly` **initialState**: `"idle"`

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L89)

Estado inicial do algoritmo.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`initialState`](../../platform/web/classes/Flow.md#initialstate)

***

### listens

> `readonly` **listens**: readonly [`Listened`](../../platform/web/type-aliases/Listened.md)[] = `[]`

Defined in: [src/scene/flows/Flow.ts:84](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L84)

Schemas (ou famílias de schemas: os registros de um ponto de extensão) cujos `resourceReady` e `poolWritten` o
Flow recebe como evento.

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`listens`](../../platform/web/classes/Flow.md#listens)

***

### pipelines

> `readonly` **pipelines**: readonly [`PipelineDescriptor`](../../platform/web/interfaces/PipelineDescriptor.md)[]

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L79)

Pipelines declarados; a C2 os prepara antes de o Flow ficar pronto.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`pipelines`](../../platform/web/classes/Flow.md#pipelines)

***

### slots

> `readonly` **slots**: [`ShadowMatrixSlots`](../interfaces/ShadowMatrixSlots.md)

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:78](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L78)

Slots consumidos, por nome.

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`slots`](../../platform/web/classes/Flow.md#slots)

***

### transitions

> `protected` `readonly` **transitions**: [`FlowTransitions`](../../platform/web/type-aliases/FlowTransitions.md)\<`"idle"`, `Ctx`\>

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:90](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L90)

Tabela de transições (estado × evento).

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`transitions`](../../platform/web/classes/Flow.md#transitions)

***

### type

> `readonly` **type**: `"ShadowMatrixFlow"` = `'ShadowMatrixFlow'`

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L77)

Nome explícito do estágio (mensagens, profiling, `flowReady`) — dado, não nome de classe (minificação).

#### Overrides

[`RenderFlow`](../../platform/web/classes/RenderFlow.md).[`type`](../../platform/web/classes/RenderFlow.md#type)

## Accessors

### lifecycle

#### Get Signature

> **get** **lifecycle**(): [`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

Defined in: [src/scene/flows/Flow.ts:94](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L94)

Estado do ciclo de vida (só a C2 o muda).

##### Returns

[`FlowLifecycle`](../../platform/web/type-aliases/FlowLifecycle.md)

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`lifecycle`](../../platform/web/classes/Flow.md#lifecycle)

***

### state

#### Get Signature

> **get** **state**(): `S`

Defined in: [src/scene/flows/Flow.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L99)

Estado próprio do algoritmo (só transições o mudam).

##### Returns

`S`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`state`](../../platform/web/classes/Flow.md#state)

## Methods

### dispatch()

> **dispatch**(`frame`, `bound`): `void`

Defined in: [src/elements/scene/flows/ShadowMatrixFlow.ts:157](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/scene/flows/ShadowMatrixFlow.ts#L157)

Grava o cálculo das matrizes das luzes vivas.

#### Parameters

##### frame

[`Frame`](../../platform/web/interfaces/Frame.md)

##### bound

[`BoundFlow`](../../platform/web/interfaces/BoundFlow.md)\<[`ShadowMatrixSlots`](../interfaces/ShadowMatrixSlots.md)\>

#### Returns

`void`

#### Overrides

[`Flow`](../../platform/web/classes/Flow.md).[`dispatch`](../../platform/web/classes/Flow.md#dispatch)

***

### dispose()

> **dispose**(): `void`

Defined in: [src/scene/flows/Flow.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/Flow.ts#L107)

Libera os recursos privados do Flow. Chamado pela C2 no descarte (`unregister`).

#### Returns

`void`

#### Inherited from

[`Flow`](../../platform/web/classes/Flow.md).[`dispose`](../../platform/web/classes/Flow.md#dispose)
