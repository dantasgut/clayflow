# Interface: RenderCommand

Defined in: [scene/rendering/RenderQueue.ts:9](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L9)

Pílula puramente descritiva (Data-Oriented).
Não possui métodos ou referências ao Grafo da Cena.

## Properties

### distanceToCamera

> **distanceToCamera**: `number`

Defined in: [scene/rendering/RenderQueue.ts:38](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L38)

***

### geometryId

> **geometryId**: `string`

Defined in: [scene/rendering/RenderQueue.ts:15](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L15)

ID do vertex buffer no ResourceManager.

***

### indexBufferId?

> `optional` **indexBufferId?**: `string`

Defined in: [scene/rendering/RenderQueue.ts:17](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L17)

ID do index buffer (opcional).

***

### instanceCount

> **instanceCount**: `number`

Defined in: [scene/rendering/RenderQueue.ts:19](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L19)

***

### materialBindGroupIds

> **materialBindGroupIds**: `string`[]

Defined in: [scene/rendering/RenderQueue.ts:32](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L32)

***

### materialLayoutId

> **materialLayoutId**: `string`

Defined in: [scene/rendering/RenderQueue.ts:13](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L13)

shaderId do material — chave do GPUBindGroupLayout no BindGroupManager.

***

### pipelineHashId

> **pipelineHashId**: `string`

Defined in: [scene/rendering/RenderQueue.ts:11](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L11)

Hash único: shaderId + '|' + topology — identifica a GPURenderPipeline a usar.

***

### topology?

> `optional` **topology?**: `GPUPrimitiveTopology`

Defined in: [scene/rendering/RenderQueue.ts:29](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L29)

Topologia — necessária para criar a pipeline.
Omitido em comandos de partículas (usa 'triangle-list' implicitamente).

***

### useVertexPulling?

> `optional` **useVertexPulling?**: `boolean`

Defined in: [scene/rendering/RenderQueue.ts:41](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L41)

Quando true, o renderer usa vertex pulling com buffers de wireframe em @group(3).

***

### vertexCount

> **vertexCount**: `number`

Defined in: [scene/rendering/RenderQueue.ts:18](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L18)

***

### vertexLayout?

> `optional` **vertexLayout?**: [`VertexLayout`](../classes/VertexLayout.md)

Defined in: [scene/rendering/RenderQueue.ts:24](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L24)

Layout dos atributos de vértice — necessário para criar a pipeline.
Omitido em comandos de partículas (vertex shader usa storage buffer interno).

***

### wireframeEdgesBufferId?

> `optional` **wireframeEdgesBufferId?**: `string`

Defined in: [scene/rendering/RenderQueue.ts:45](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L45)

ID do storage buffer de arestas wireframe (2 u32 por aresta).

***

### wireframePositionsBufferId?

> `optional` **wireframePositionsBufferId?**: `string`

Defined in: [scene/rendering/RenderQueue.ts:43](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L43)

ID do storage buffer de posições wireframe (3 floats por vértice).

***

### worldMatrix

> **worldMatrix**: `Float32Array`

Defined in: [scene/rendering/RenderQueue.ts:35](https://github.com/dantasgut/clayflow/blob/65554994d1b604a896571b1ce5763d12e7f64783/src/scene/rendering/RenderQueue.ts#L35)
