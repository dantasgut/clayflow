[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / DiffuseSlots

# Interface: DiffuseSlots

Defined in: elements/particles/DiffuseFlow.ts:39

Slots do estágio das partículas secundárias.

## Extends

- `SlotMap`

## Indexable

> \[`key`: `string`\]: `SlotDeclaration`

## Properties

### colliderPools

> `readonly` **colliderPools**: `PoolsSlot`

Defined in: elements/particles/DiffuseFlow.ts:49

Pools dos colliders e dos corpos donos (o spray colide com os sólidos da cena).

***

### colliders

> `readonly` **colliders**: `EntitiesSlot`

Defined in: elements/particles/DiffuseFlow.ts:51

Entidades com collider.

***

### diffuse

> `readonly` **diffuse**: `EntitiesSlot`

Defined in: elements/particles/DiffuseFlow.ts:41

Partículas secundárias com a nuvem de pontos onde são desenhadas (o estágio escreve os vértices).

***

### gravity

> `readonly` **gravity**: `SingletonSlot`\<`true`\>

Defined in: elements/particles/DiffuseFlow.ts:45

Gravidade uniforme (opcional; padrão −9,81 em y).

***

### material

> `readonly` **material**: `SingletonSlot`\<`true`\>

Defined in: elements/particles/DiffuseFlow.ts:47

Material das partículas do fluido (espaçamento, domínio).

***

### time

> `readonly` **time**: `SingletonSlot`\<`false`\>

Defined in: elements/particles/DiffuseFlow.ts:43

Relógio da cena.
