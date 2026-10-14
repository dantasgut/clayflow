[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / RenderableSchema

# Variable: RenderableSchema

> `const` **RenderableSchema**: `StructSchema`

Defined in: [elements/scene/Renderable.ts:12](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/elements/scene/Renderable.ts#L12)

Registro de desenho por entidade com Geometry + Material + Transform (pool `Renderable`): o slot da matriz de mundo
(`WorldTransform`) e o do material no pool do seu schema. O slot do registro é o `firstInstance` do desenho; o
shader lê `renderables[instance_index]` e, por ele, a matriz e o material — nenhum bind group muda entre desenhos.
