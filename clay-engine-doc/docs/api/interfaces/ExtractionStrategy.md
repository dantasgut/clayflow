# Interface: ExtractionStrategy

Defined in: [scene/rendering/strategies/ExtractionStrategy.ts:9](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/rendering/strategies/ExtractionStrategy.ts#L9)

Padrão Strategy: Interface base para extração de entidades da Cena (Camada 2).
Permite que novos componentes sejam renderizados/processados sem modificar o RenderExtractor.

## Methods

### extract()

> **extract**(`entity`, `queue`, `cameraWorldPos?`): `void`

Defined in: [scene/rendering/strategies/ExtractionStrategy.ts:10](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/rendering/strategies/ExtractionStrategy.ts#L10)

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

##### queue

[`RenderQueue`](RenderQueue.md)

##### cameraWorldPos?

`vec3`

#### Returns

`void`
