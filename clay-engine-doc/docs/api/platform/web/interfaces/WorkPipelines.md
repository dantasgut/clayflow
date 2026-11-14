[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WorkPipelines

# Interface: WorkPipelines

Defined in: [src/scene/flows/FlowWork.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L29)

Os pipelines do Flow dono do trabalho (T060g), pela C2: o que as partes do trabalho (as peças de compute: somas de
prefixos, ordenações, a grade hash…) preparam e ligam como o próprio Flow (`TransitionContext.prepare`/`bind`/
`release`), e o pipeline de compute pronto na gravação. Ids e ligações das partes levam o prefixo da instância: duas
peças iguais no mesmo Flow ligam pelo pipeline (`{ pipeline, resource }`).

## Methods

### bind()

> **bind**(`sources`): `void`

Defined in: [src/scene/flows/FlowWork.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L33)

Liga (ou troca) fontes privadas dos pipelines do Flow dono.

#### Parameters

##### sources

[`BindingSources`](../type-aliases/BindingSources.md)

#### Returns

`void`

***

### compute()

> **compute**(`id`): [`PreparedCompute`](PreparedCompute.md) \| `undefined`

Defined in: [src/scene/flows/FlowWork.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L43)

O pipeline de compute `id`, ou `undefined` se não foi preparado ou ainda não está pronto.

#### Parameters

##### id

`string`

#### Returns

[`PreparedCompute`](PreparedCompute.md) \| `undefined`

***

### kernel()

> **kernel**(`spec`): `string`

Defined in: [src/scene/flows/FlowWork.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L41)

Prepara um kernel de compute do Flow dono com as fontes privadas dele (ligadas só a ele, `{ pipeline, resource }`)
e devolve o id (o prefixo `discriminator` com um número: único no Flow). Para trocar uma fonte, `release` e um
kernel novo.

#### Parameters

##### spec

[`WorkKernel`](WorkKernel.md)

#### Returns

`string`

***

### prepare()

> **prepare**(`descriptor`): `void`

Defined in: [src/scene/flows/FlowWork.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L31)

Prepara um pipeline do Flow dono (idempotente por id).

#### Parameters

##### descriptor

[`PipelineDescriptor`](PipelineDescriptor.md)

#### Returns

`void`

***

### release()

> **release**(`id`): `void`

Defined in: [src/scene/flows/FlowWork.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L35)

Libera um pipeline preparado.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### use()

> **use**(`binder`, `id`, `offsets?`): `void`

Defined in: [src/scene/flows/FlowWork.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/FlowWork.ts#L48)

Grava o kernel `id` no passe: o pipeline e os grupos (com os offsets da frequência dos dinâmicos).

#### Parameters

##### binder

`Binder`\<[`ComputePipelineSpec`](ComputePipelineSpec.md)\>

##### id

`string`

##### offsets?

`Readonly`\<`Partial`\<`Record`\<[`BindingFrequency`](../type-aliases/BindingFrequency.md), readonly `number`[]\>\>\>

#### Returns

`void`

#### Throws

Error se o kernel não está pronto (as partes preparam nas transições; a C2 compila antes da gravação).
