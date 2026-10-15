[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RenderableSchema

# Variable: RenderableSchema

> `const` **RenderableSchema**: `StructSchema`

Defined in: [elements/scene/Renderable.ts:14](https://github.com/dantasgut/clayflow/blob/578e874c02e0ea7a21451e81f9bd44b18ded2074/src/elements/scene/Renderable.ts#L14)

Registro de desenho por entidade com Geometry + Material + Transform (pool `Renderable`): o slot da matriz de mundo
(`WorldTransform`) e o do material no pool do seu schema. O slot do registro é o `firstInstance` do desenho; o
shader lê `renderables[instance_index]` e, por ele, a matriz e o material — nenhum bind group muda entre desenhos.
