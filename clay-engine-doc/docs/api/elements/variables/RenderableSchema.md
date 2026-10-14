[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RenderableSchema

# Variable: RenderableSchema

> `const` **RenderableSchema**: `StructSchema`

Defined in: [elements/scene/Renderable.ts:12](https://github.com/dantasgut/clayflow/blob/161548fe265352b137bd38850130eaaaf360daf5/src/elements/scene/Renderable.ts#L12)

Registro de desenho por entidade com Geometry + Material + Transform (pool `Renderable`): o slot da matriz de mundo
(`WorldTransform`) e o do material no pool do seu schema. O slot do registro é o `firstInstance` do desenho; o
shader lê `renderables[instance_index]` e, por ele, a matriz e o material — nenhum bind group muda entre desenhos.
