[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPSlots

# Interface: LCPSlots

Defined in: [elements/physics/flows/LCPFlow.ts:110](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L110)

Slots do LCP.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### bodies

> `readonly` **bodies**: `BodiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:112](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L112)

Pool de corpos do `bodyType` do registro.

***

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:118](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L118)

Pools de colliders e de corpos rígidos (cada um presente ou não).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: [elements/physics/flows/LCPFlow.ts:120](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L120)

Entidades com collider (donos dos registros nos pools de collider).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: [elements/physics/flows/LCPFlow.ts:116](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L116)

Campo de gravidade (opcional; padrão `[0, −9,81, 0]`).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: [elements/physics/flows/LCPFlow.ts:114](https://github.com/dantasgut/clayflow/blob/5bbc103f761cefaddb7550b2709ec33b35ebe0e0/src/elements/physics/flows/LCPFlow.ts#L114)

Relógio da cena (passos fixos do quadro).
