[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / XPBDSlots

# Interface: XPBDSlots

Defined in: [elements/physics/flows/XPBDFlow.ts:36](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L36)

Slots do XPBD.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/XPBDFlow.ts:38](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L38)

Pool de corpos do `bodyType` do registro.

***

### constraints

> `readonly` **constraints**: `PoolSlot`\<`true`\>

Defined in: [elements/physics/flows/XPBDFlow.ts:42](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L42)

Pool das restrições de distância (opcional).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/XPBDFlow.ts:44](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L44)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/XPBDFlow.ts:40](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/XPBDFlow.ts#L40)

Relógio da cena (passos fixos do quadro).
