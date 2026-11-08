[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / SoftBodyRangeSchema

# Variable: SoftBodyRangeSchema

> `const` **SoftBodyRangeSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/physics/energy/schemas.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/physics/energy/schemas.ts#L57)

A faixa de um corpo mole (spec 037, energia dos corpos moles), enviada na inserção: as partículas (`first`, `count`)
no pool do algoritmo, as arestas (`first_edge`, `edge_count`) no pool `DistanceConstraint` (só XPBD), o algoritmo e
os blocos (`first_chunk`, `chunk_count`) nos pools `SoftBodyChunk`/`SoftBodyPartial` — os inícios resolvidos pela C2
(`slotRefs` `self:`). Ocupa o mesmo slot que a série `SoftBodyEnergy` do corpo.
