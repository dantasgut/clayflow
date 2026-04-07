# Interface: NeighborSearchConfig

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:55](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/shared/NeighborSearchGridLayout.ts#L55)

## Properties

### cellSize

> **cellSize**: `number`

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:59](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/shared/NeighborSearchGridLayout.ts#L59)

Raio de suavização h = tamanho de célula (metros).

***

### dims

> **dims**: \[`number`, `number`, `number`\]

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:61](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/shared/NeighborSearchGridLayout.ts#L61)

Dimensões da grade em células [x, y, z]. n_cells = x*y*z ≤ 65536.

***

### maxNeighbors?

> `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:63](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/shared/NeighborSearchGridLayout.ts#L63)

Número máximo de vizinhos por partícula. Default: 64.

***

### origin

> **origin**: \[`number`, `number`, `number`\]

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:57](https://github.com/dantasgut/clayflow/blob/b3dfee2b900d61c7c75366d8c2100dcee3d4e71a/src/elements/physics/shared/NeighborSearchGridLayout.ts#L57)

Origem do volume de busca em world space.
