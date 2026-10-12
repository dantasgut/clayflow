[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / ColliderSet

# Class: ColliderSet

Defined in: [elements/physics/colliders/ColliderSet.ts:70](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L70)

Conjunto de colliders compartilhado pelos estágios que colidem contra os pools tipados (narrowphase do LCP,
colisão dos fluidos). Mantém, por pool, o mapa collider → corpo dono (a pose de um collider dinâmico vem do corpo)
e buffers mínimos para pools ausentes, de modo que os bindings sejam sempre válidos.

Os mapas são reconstruídos só quando marcados como sujos (pool realocado, entidades inseridas ou removidas);
`generation` muda quando algum buffer ligado muda — o consumidor recria seus bind groups.

Grupo de colliders (`bindings()`, grupo 2 nos kernels de colisão): `b0` contagens, `b1–b3` pools de plano, caixa
e esfera, `b4–b6` mapas de dono, `b7` pool de corpos.

## Constructors

### Constructor

> **new ColliderSet**(`core`, `world`, `resources`, `options`): `ColliderSet`

Defined in: [elements/physics/colliders/ColliderSet.ts:80](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L80)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options

[`ColliderSetOptions`](../interfaces/ColliderSetOptions.md)

#### Returns

`ColliderSet`

## Accessors

### generation

#### Get Signature

> **get** **generation**(): `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:90](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L90)

Muda sempre que um buffer exposto por `pool()`/`bindings()` muda.

##### Returns

`number`

***

### totalCount

#### Get Signature

> **get** **totalCount**(): `number`

Defined in: [elements/physics/colliders/ColliderSet.ts:95](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L95)

Total de colliders em todos os pools.

##### Returns

`number`

## Methods

### bindings()

> **bindings**(): `ComputeKernelBinding`[]

Defined in: [elements/physics/colliders/ColliderSet.ts:143](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L143)

Bindings do grupo de colliders (plano, caixa e esfera) — ver a documentação da classe.

#### Returns

`ComputeKernelBinding`[]

***

### bodiesBuffer()

> **bodiesBuffer**(): `StorageBufferSpec`

Defined in: [elements/physics/colliders/ColliderSet.ts:135](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L135)

Pool de corpos donos (ou buffer mínimo).

#### Returns

`StorageBufferSpec`

***

### destroy()

> **destroy**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:162](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L162)

Libera os buffers próprios (mapas de dono, buffers mínimos, contagens).

#### Returns

`void`

***

### markDirty()

> **markDirty**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:102](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L102)

Marca os mapas de dono para reconstrução no próximo `refresh()`.

#### Returns

`void`

***

### onPoolReallocated()

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:107](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L107)

Reação do estágio dono a `onPoolReallocated`: só pools de collider e de corpos afetam o conjunto.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

***

### pool()

> **pool**(`poolKey`): [`ColliderPoolView`](../interfaces/ColliderPoolView.md)

Defined in: [elements/physics/colliders/ColliderSet.ts:123](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L123)

Visão de um pool de collider (válida depois de `refresh()`).

#### Parameters

##### poolKey

`string`

#### Returns

[`ColliderPoolView`](../interfaces/ColliderPoolView.md)

***

### refresh()

> **refresh**(): `void`

Defined in: [elements/physics/colliders/ColliderSet.ts:114](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/colliders/ColliderSet.ts#L114)

Reconstrói os mapas de dono e as contagens se sujos; garante buffers válidos para todos os pools.

#### Returns

`void`
