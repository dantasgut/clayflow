[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntityRecordDeclaration

# Interface: EntityRecordDeclaration

Defined in: [src/scene/flows/slots.ts:60](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L60)

Registro de GPU por entidade de um conjunto `entities`, mantido pela C2 num pool com chave `schema.name`. Cada campo
(`u32` no schema) recebe o slot de pool do descritor `descId` do Resource da entidade que é instância do tipo dado —
ex.: `Renderable` = `{ transformSlot: [Transform, 'world'], materialSlot: [Material, 'material'] }`. Conjuntos com a
mesma declaração compartilham o pool e o slot; estágios só leem.

## Properties

### fields

> `readonly` **fields**: `Readonly`\<`Record`\<`string`, readonly \[[`ResourceType`](../type-aliases/ResourceType.md), `string`, \{ `optional`: `true`; \}?\]\>\>

Defined in: [src/scene/flows/slots.ts:69](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L69)

Campo → [classe do Resource da entidade, id do descritor em pool cujo slot vai no campo]. Com o terceiro
elemento `{ optional: true }`, o tipo não precisa estar em `all`: entidade sem o Resource — ou com o Resource sem
o descritor (spec 010) — tem `RECORD_NONE` no campo (spec 009 — ex.: o registro da função `material` da entidade,
quando há; a geometria diferencial da superfície, quando ela a declara).

***

### schema

> `readonly` **schema**: [`StructSchema`](../classes/StructSchema.md)

Defined in: [src/scene/flows/slots.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/flows/slots.ts#L62)

Schema do registro (um campo `u32` por entrada de `fields`); o nome é a chave do pool.
