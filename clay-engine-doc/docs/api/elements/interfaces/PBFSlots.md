[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / PBFSlots

# Interface: PBFSlots

Defined in: [src/elements/physics/flows/PBFFlow.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L77)

Slots do PBF.

## Extends

- [`SlotMap`](../../platform/web/type-aliases/SlotMap.md)

## Indexable

> \[`key`: `string`\]: [`SlotDeclaration`](../../platform/web/type-aliases/SlotDeclaration.md)

## Properties

### bodies

> `readonly` **bodies**: [`BodiesSlot`](../../platform/web/interfaces/BodiesSlot.md)

Defined in: [src/elements/physics/flows/PBFFlow.ts:79](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L79)

Pool de corpos do `bodyType` do registro.

***

### boundary

> `readonly` **boundary**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:95](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L95)

Fronteira sólida por partícula (pool do corpo, mesmo slot; Σ −B' n, Σ B; spec 034).

***

### colliderPools

> `readonly` **colliderPools**: [`PoolsSlot`](../../platform/web/interfaces/PoolsSlot.md)

Defined in: [src/elements/physics/flows/PBFFlow.ts:87](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L87)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: [`EntitiesSlot`](../../platform/web/interfaces/EntitiesSlot.md)

Defined in: [src/elements/physics/flows/PBFFlow.ts:89](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L89)

Entidades com collider (donos dos registros nos pools de collider).

***

### delta

> `readonly` **delta**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L91)

Correções Δp/Δv por partícula (pool do corpo, mesmo slot), separadas das posições lidas pelos vizinhos.

***

### gravity

> `readonly` **gravity**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:83](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L83)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### normals

> `readonly` **normals**: [`PoolSlot`](../../platform/web/interfaces/PoolSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:93](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L93)

(nᵢ, ρᵢ) por partícula para a tensão superficial de Akinci (pool do corpo, mesmo slot; spec 030).

***

### physics

> `readonly` **physics**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`true`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:85](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L85)

Comportamento das partículas (opcional; padrões do solver).

***

### time

> `readonly` **time**: [`SingletonSlot`](../../platform/web/interfaces/SingletonSlot.md)\<`false`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:81](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L81)

Relógio da cena (passos fixos do quadro).

***

### work

> `readonly` **work**: [`WorkSlot`](../../platform/web/interfaces/WorkSlot.md)\<`PBFWork`\>

Defined in: [src/elements/physics/flows/PBFFlow.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/flows/PBFFlow.ts#L97)

O espaço de trabalho do solver: parâmetros por iteração, vizinhança, colliders (spec 039).
