[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EmitterSlots

# Interface: EmitterSlots

Defined in: [elements/particles/EmitterFlow.ts:33](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L33)

Slots do estágio dos emissores.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/particles/EmitterFlow.ts:45](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L45)

Pools dos colliders e dos corpos donos (spec 010: as partículas colidem com os colliders).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/particles/EmitterFlow.ts:47](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L47)

Entidades com collider.

***

### emitters

> `readonly` **emitters**: `EntitiesSlot`

Defined in: [elements/particles/EmitterFlow.ts:35](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L35)

Emissores com a nuvem de pontos onde as partículas são desenhadas (o estágio escreve os vértices).

***

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/particles/EmitterFlow.ts:39](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L39)

Pool dos registros de parâmetros das `EmitFunction` (opcional).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/particles/EmitterFlow.ts:37](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L37)

Emissores com `EmitFunction`.

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/particles/EmitterFlow.ts:41](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L41)

Gravidade uniforme (opcional; padrão −9,81 em y).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/particles/EmitterFlow.ts:43](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/particles/EmitterFlow.ts#L43)

Relógio da cena.
