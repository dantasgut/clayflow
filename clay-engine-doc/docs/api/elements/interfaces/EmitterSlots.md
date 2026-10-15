[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / EmitterSlots

# Interface: EmitterSlots

Defined in: [elements/particles/EmitterFlow.ts:29](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/EmitterFlow.ts#L29)

Slots do estágio dos emissores.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### emitters

> `readonly` **emitters**: `EntitiesSlot`

Defined in: [elements/particles/EmitterFlow.ts:31](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/EmitterFlow.ts#L31)

Emissores com a nuvem de pontos onde as partículas são desenhadas (o estágio escreve os vértices).

***

### fnRecords

> `readonly` **fnRecords**: `PoolSlot`\<`true`\>

Defined in: [elements/particles/EmitterFlow.ts:35](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/EmitterFlow.ts#L35)

Pool dos registros de parâmetros das `EmitFunction` (opcional).

***

### functions

> `readonly` **functions**: `EntitiesSlot`

Defined in: [elements/particles/EmitterFlow.ts:33](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/EmitterFlow.ts#L33)

Emissores com `EmitFunction`.

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/particles/EmitterFlow.ts:37](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/EmitterFlow.ts#L37)

Gravidade uniforme (opcional; padrão −9,81 em y).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/particles/EmitterFlow.ts:39](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/elements/particles/EmitterFlow.ts#L39)

Relógio da cena.
