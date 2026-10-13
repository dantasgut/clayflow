[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ColliderSet

# Class: ColliderSet

Defined in: [elements/physics/colliders/ColliderSet.ts:93](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L93)

Conjunto de colliders compartilhado pelos estágios que colidem contra os pools tipados (narrowphase do LCP,
colisão dos fluidos) — peça dos slots do Flow (`slot.pools` dos colliders): mantém, por pool, o mapa collider →
corpo dono (a pose de um collider dinâmico vem do corpo) e buffers mínimos para pools ausentes, de modo que os
bindings sejam sempre válidos.

Os mapas são recursos privados do Flow dono, reconstruídos numa **transição** (entidades de collider inseridas ou
removidas, pool realocado — `markDirty` + `refresh`), nunca no `dispatch`; `refresh()` devolve se alguma fonte
mudou e o Flow religa `sources()` (`ctx.bind`).

Fontes do grupo de colliders (`sources()`, nomes do `collider_set.wgsl`): contagens, pools de plano, caixa, esfera e
malha, mapas de dono de cada um e o pool de corpos.

## Constructors

### Constructor

> **new ColliderSet**(`core`, `world`, `resources`, `options`): `ColliderSet`

Defined in: [elements/physics/colliders/ColliderSet.ts:107](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L107)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceDirectory`

##### options

[`ColliderSetOptions`](../interfaces/ColliderSetOptions.md)

#### Returns

`ColliderSet`

## Accessors

### generation

#### Get Signature

> **get** **generation**(): `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:117](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L117)

Muda sempre que um buffer exposto por `pool()`/`bindings()` muda.

##### Returns

`number`

***

### totalCount

#### Get Signature

> **get** **totalCount**(): `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:122](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L122)

Total de colliders em todos os pools.

##### Returns

`number`

## Methods

### bodiesBuffer()

> **bodiesBuffer**(): `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:196](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L196)

Pool de corpos donos (ou buffer mínimo).

#### Returns

`StorageBufferSpec`

***

### broadphase()

> **broadphase**(): `BroadphaseShape`

Defined in: [elements/physics/colliders/ColliderSet.ts:190](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L190)

Dados da broadphase (válidos depois de `refresh()`).

#### Returns

`BroadphaseShape`

***

### destroy()

> **destroy**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:204](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L204)

Libera os buffers próprios (mapas de dono, buffers mínimos, contagens).

#### Returns

`void`

***

### markDirty()

> **markDirty**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:129](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L129)

Marca os mapas de dono para reconstrução no próximo `refresh()`.

#### Returns

`void`

***

### onPoolReallocated()

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:134](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L134)

Reação do estágio dono ao evento `poolReallocated`: só pools de collider e de corpos afetam o conjunto.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

***

### pool()

> **pool**(`poolKey`): [`ColliderPoolView`](../interfaces/ColliderPoolView.md)

Defined in: [elements/physics/colliders/ColliderSet.ts:178](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L178)

Visão de um pool de collider (válida depois de `refresh()`).

#### Parameters

##### poolKey

`string`

#### Returns

[`ColliderPoolView`](../interfaces/ColliderPoolView.md)

***

### refresh()

> **refresh**(): `boolean`

Defined in: [elements/physics/colliders/ColliderSet.ts:144](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L144)

Reconstrói os mapas de dono e as contagens se sujos; garante buffers válidos para todos os pools. Chamado numa
transição do Flow dono. Devolve `true` se alguma fonte de `sources()`/`pool()` mudou (religar).

#### Returns

`boolean`

***

### sources()

> **sources**(): `BindingSources`

Defined in: [elements/physics/colliders/ColliderSet.ts:156](https://github.com/dantasgut/clayflow/blob/4de303a3fc5e7df4fcf27aed6a61f9e65e814c8b/src/elements/physics/colliders/ColliderSet.ts#L156)

Fontes do grupo de colliders pelos nomes do `collider_set.wgsl` (válidas depois de `refresh()`).

#### Returns

`BindingSources`
