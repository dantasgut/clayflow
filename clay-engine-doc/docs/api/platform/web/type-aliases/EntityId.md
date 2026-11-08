[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / EntityId

# Type Alias: EntityId

> **EntityId** = `number` & `object`

Defined in: [src/scene/world/EntityId.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/world/EntityId.ts#L8)

Branded number — identificador opaco de Entity no World.
Marca evita confusão com outros IDs numéricos (resourceId, frameNo, etc.)
via type-level branding (zero runtime cost).

## Type Declaration

### \[\_\_\_entityIdBrand\]

> `readonly` **\[\_\_\_entityIdBrand\]**: `true`

Brand marker — único por tipo, força incompatibilidade nominal.
