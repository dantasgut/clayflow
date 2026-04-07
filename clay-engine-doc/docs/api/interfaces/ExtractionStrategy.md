# Interface: ExtractionStrategy

Defined in: [scene/rendering/strategies/ExtractionStrategy.ts:9](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/rendering/strategies/ExtractionStrategy.ts#L9)

Padrão Strategy: Interface base para extração de entidades da Cena (Camada 2).
Permite que novos componentes sejam renderizados/processados sem modificar o RenderExtractor.

## Methods

### extract()

> **extract**(`entity`, `queue`, `cameraWorldPos?`): `void`

Defined in: [scene/rendering/strategies/ExtractionStrategy.ts:10](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/scene/rendering/strategies/ExtractionStrategy.ts#L10)

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

##### queue

[`RenderQueue`](RenderQueue.md)

##### cameraWorldPos?

`vec3`

#### Returns

`void`
