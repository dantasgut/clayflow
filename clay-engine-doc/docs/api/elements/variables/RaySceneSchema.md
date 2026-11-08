[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / RaySceneSchema

# Variable: RaySceneSchema

> `const` **RaySceneSchema**: [`StructSchema`](../../platform/web/classes/StructSchema.md)

Defined in: [src/elements/raytrace/schemas.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/elements/raytrace/schemas.ts#L43)

A estrutura de raios da cena (uniform): a palavra em que começa cada região da `RayScene` nos dois pools
(vértices, triângulos e esferas na geometria; nós, hierarquias e instâncias na hierarquia), o número de instâncias e
a raiz da hierarquia de cima (nó local à região de nós). Atualizada pelo estágio que constrói a estrutura.
