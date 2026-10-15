[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ColliderSet

# Class: ColliderSet

Defined in: [elements/physics/colliders/ColliderSet.ts:118](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L118)

Conjunto de colliders compartilhado pelos estágios que colidem contra os pools tipados (narrowphase do LCP,
colisão dos fluidos) — peça dos slots do Flow (`slot.pools` dos colliders): mantém, por pool, o mapa collider →
corpo dono (a pose de um collider dinâmico vem do corpo) e buffers mínimos para pools ausentes, de modo que os
bindings sejam sempre válidos.

Os mapas são recursos privados do Flow dono, reconstruídos numa **transição** (entidades de collider inseridas ou
removidas, pool realocado — `markDirty` + `refresh`), nunca no `dispatch`; `refresh()` devolve se alguma fonte
mudou e o Flow religa `sources()` (`ctx.bind`).

Fontes do grupo de colliders (`sources()`, nomes do `collider_set.wgsl`): contagens, pools de plano, caixa, esfera,
malha e superfície, o mapa de donos comum (caixas e esferas; o da malha à parte), o pool de corpos e o campo das
superfícies. Os mapas por pool (`pool(key).owners`) continuam para a narrowphase do LCP.

## Constructors

### Constructor

> **new ColliderSet**(`core`, `world`, `resources`, `options`): `ColliderSet`

Defined in: [elements/physics/colliders/ColliderSet.ts:137](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L137)

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

Defined in: [elements/physics/colliders/ColliderSet.ts:147](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L147)

Muda sempre que um buffer exposto por `pool()`/`bindings()` muda.

##### Returns

`number`

***

### surfaceCount

#### Get Signature

> **get** **surfaceCount**(): `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:159](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L159)

Colliders de superfície (spec 010).

##### Returns

`number`

***

### totalCount

#### Get Signature

> **get** **totalCount**(): `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:152](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L152)

Total de colliders em todos os pools.

##### Returns

`number`

## Methods

### bodiesBuffer()

> **bodiesBuffer**(): `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:236](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L236)

Pool de corpos donos (ou buffer mínimo).

#### Returns

`StorageBufferSpec`

***

### broadphase()

> **broadphase**(): `BroadphaseShape`

Defined in: [elements/physics/colliders/ColliderSet.ts:230](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L230)

Dados da broadphase (válidos depois de `refresh()`).

#### Returns

`BroadphaseShape`

***

### destroy()

> **destroy**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:250](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L250)

Libera os buffers próprios (mapas de dono, buffers mínimos, contagens).

#### Returns

`void`

***

### fieldBuffer()

> **fieldBuffer**(): `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:244](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L244)

Campo das superfícies (pool `SurfaceColliderCell`, ou buffer mínimo).

#### Returns

`StorageBufferSpec`

***

### markDirty()

> **markDirty**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:164](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L164)

Marca os mapas de dono para reconstrução no próximo `refresh()`.

#### Returns

`void`

***

### onPoolReallocated()

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:169](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L169)

Reação do estágio dono ao evento `poolReallocated`: só pools de collider e de corpos afetam o conjunto.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

***

### pool()

> **pool**(`poolKey`): [`ColliderPoolView`](../interfaces/ColliderPoolView.md)

Defined in: [elements/physics/colliders/ColliderSet.ts:218](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L218)

Visão de um pool de collider (válida depois de `refresh()`).

#### Parameters

##### poolKey

`string`

#### Returns

[`ColliderPoolView`](../interfaces/ColliderPoolView.md)

***

### refresh()

> **refresh**(): `boolean`

Defined in: [elements/physics/colliders/ColliderSet.ts:183](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L183)

Reconstrói os mapas de dono e as contagens se sujos; garante buffers válidos para todos os pools. Chamado numa
transição do Flow dono. Devolve `true` se alguma fonte de `sources()`/`pool()` mudou (religar).

#### Returns

`boolean`

***

### sources()

> **sources**(): `BindingSources`

Defined in: [elements/physics/colliders/ColliderSet.ts:197](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/physics/colliders/ColliderSet.ts#L197)

Fontes do grupo de colliders pelos nomes do `collider_set.wgsl` (válidas depois de `refresh()`).

#### Returns

`BindingSources`
