[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / ColliderSet

# Class: ColliderSet

Defined in: [src/elements/physics/colliders/ColliderSet.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L109)

Conjunto de colliders compartilhado pelos estágios que colidem contra os pools tipados (narrowphase do LCP,
colisão dos fluidos) — peça dos slots do Flow (`slot.pools` dos colliders): mantém, por pool, o mapa collider →
corpo dono (a pose de um collider dinâmico vem do corpo) e buffers mínimos para pools ausentes, de modo que os
bindings sejam sempre válidos.

Os mapas são descritores do Resource de trabalho do Flow dono (spec 039: a C2 aloca, envia no mesmo quadro e
libera), reconstruídos numa **transição** (entidades de collider inseridas ou removidas, pool realocado —
`markDirty` + `refresh`), nunca no `dispatch`; `refresh()` devolve se alguma fonte mudou e o Flow religa
`sources()` (`ctx.bind`).

Fontes do grupo de colliders (`sources()`, nomes do `collider_set.wgsl`): contagens, pools de plano, caixa, esfera,
malha e superfície, o mapa de donos comum (caixas e esferas; o da malha à parte), o pool de corpos e o campo das
superfícies. Os mapas por pool (`pool(key).owners`) continuam para a narrowphase do LCP.

## Implements

- [`WorkPart`](../../platform/web/interfaces/WorkPart.md)

## Constructors

### Constructor

> **new ColliderSet**(`ctx`, `world`, `options`): `ColliderSet`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L133)

#### Parameters

##### ctx

[`WorkContext`](../../platform/web/interfaces/WorkContext.md)

##### world

[`World`](../../platform/web/classes/World.md)

##### options

[`ColliderSetOptions`](../interfaces/ColliderSetOptions.md)

#### Returns

`ColliderSet`

## Accessors

### generation

#### Get Signature

> **get** **generation**(): `number`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:168](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L168)

Muda sempre que um buffer exposto por `pool()`/`bindings()` muda.

##### Returns

`number`

***

### surfaceCount

#### Get Signature

> **get** **surfaceCount**(): `number`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:180](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L180)

Colliders de superfície (spec 010).

##### Returns

`number`

***

### totalCount

#### Get Signature

> **get** **totalCount**(): `number`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:173](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L173)

Total de colliders em todos os pools.

##### Returns

`number`

## Methods

### bodiesBuffer()

> **bodiesBuffer**(): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/physics/colliders/ColliderSet.ts:300](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L300)

Pool de corpos donos (ou buffer mínimo).

#### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

***

### broadphase()

> **broadphase**(): `BroadphaseShape`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:294](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L294)

Dados da broadphase (válidos depois de `refresh()`).

#### Returns

`BroadphaseShape`

***

### descriptors()

> **descriptors**(): readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

Defined in: [src/elements/physics/colliders/ColliderSet.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L143)

Os descritores atuais da parte (ids únicos no Resource de trabalho).

#### Returns

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

#### Implementation of

[`WorkPart`](../../platform/web/interfaces/WorkPart.md).[`descriptors`](../../platform/web/interfaces/WorkPart.md#descriptors)

***

### fieldBuffer()

> **fieldBuffer**(): [`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

Defined in: [src/elements/physics/colliders/ColliderSet.ts:308](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L308)

Campo das superfícies (pool `SurfaceColliderCell`, ou buffer mínimo).

#### Returns

[`StorageBufferSpec`](../../platform/web/interfaces/StorageBufferSpec.md)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:185](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L185)

Marca os mapas de dono para reconstrução no próximo `refresh()`.

#### Returns

`void`

***

### onPoolReallocated()

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:190](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L190)

Reação do estágio dono ao evento `poolReallocated`: só pools de collider e de corpos afetam o conjunto.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

***

### pool()

> **pool**(`poolKey`): [`ColliderPoolView`](../interfaces/ColliderPoolView.md)

Defined in: [src/elements/physics/colliders/ColliderSet.ts:283](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L283)

Visão de um pool de collider (válida depois de `refresh()`).

#### Parameters

##### poolKey

`string`

#### Returns

[`ColliderPoolView`](../interfaces/ColliderPoolView.md)

***

### refresh()

> **refresh**(): `boolean`

Defined in: [src/elements/physics/colliders/ColliderSet.ts:204](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L204)

Reconstrói os mapas de dono e as contagens se sujos; garante buffers válidos para todos os pools. Chamado numa
transição do Flow dono. Devolve `true` se alguma fonte de `sources()`/`pool()` mudou (religar).

#### Returns

`boolean`

***

### sources()

> **sources**(): `ReadonlyMap`\<[`WgslResource`](../../platform/web/interfaces/WgslResource.md), [`BindingSource`](../../platform/web/type-aliases/BindingSource.md)\>

Defined in: [src/elements/physics/colliders/ColliderSet.ts:262](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/colliders/ColliderSet.ts#L262)

Fontes dos recursos do conjunto de colliders (`colliderResources`; válidas depois de `refresh()`).

#### Returns

`ReadonlyMap`\<[`WgslResource`](../../platform/web/interfaces/WgslResource.md), [`BindingSource`](../../platform/web/type-aliases/BindingSource.md)\>
