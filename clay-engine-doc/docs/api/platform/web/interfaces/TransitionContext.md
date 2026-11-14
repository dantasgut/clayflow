[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / TransitionContext

# Interface: TransitionContext\<TSlots\>

Defined in: [src/scene/flows/FlowBinding.ts:174](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L174)

Contexto de uma transição (`run`).

## Type Parameters

### TSlots

`TSlots` *extends* [`SlotMap`](../type-aliases/SlotMap.md) = [`SlotMap`](../type-aliases/SlotMap.md)

## Properties

### bound

> `readonly` **bound**: [`BoundFlow`](BoundFlow.md)\<`TSlots`\>

Defined in: [src/scene/flows/FlowBinding.ts:176](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L176)

Slots e pipelines atuais.

## Methods

### bind()

> **bind**(`sources`): `void`

Defined in: [src/scene/flows/FlowBinding.ts:181](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L181)

Liga (ou troca) fontes privadas por recurso declarado. A C2 recria os bind groups que os usam antes da próxima
gravação; use ao recriar um recurso privado (ex.: contatos após o crescimento do pool de corpos).

#### Parameters

##### sources

[`BindingSources`](../type-aliases/BindingSources.md)

#### Returns

`void`

***

### prepare()

> **prepare**(`descriptor`): [`PreparedPipeline`](../type-aliases/PreparedPipeline.md)

Defined in: [src/scene/flows/FlowBinding.ts:186](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L186)

Prepara um pipeline além dos declarados (ex.: o de um material que entrou na cena). Idempotente por `id`. Fica
pronto em `pipelinesCompiled { pipeline: id }` quando compilado em segundo plano.

#### Parameters

##### descriptor

[`PipelineDescriptor`](PipelineDescriptor.md)

#### Returns

[`PreparedPipeline`](../type-aliases/PreparedPipeline.md)

***

### produced()

> **produced**(`resource`, `descId`, `produced`): `void`

Defined in: [src/scene/flows/FlowBinding.ts:193](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L193)

Declara se este Flow produziu o descritor `descId` de `resource` neste quadro (spec 031, R5; em `framePrepare`,
antes da gravação). Quem lê consulta `ResourceDirectory.isProduced`. Um descritor tem um produtor só.

#### Parameters

##### resource

[`Resource`](Resource.md)

##### descId

`string`

##### produced

`boolean`

#### Returns

`void`

***

### release()

> **release**(`id`): `void`

Defined in: [src/scene/flows/FlowBinding.ts:188](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowBinding.ts#L188)

Libera um pipeline preparado em transição (e os seus bind groups).

#### Parameters

##### id

`string`

#### Returns

`void`
