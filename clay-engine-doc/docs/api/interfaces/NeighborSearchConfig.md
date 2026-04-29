# Interface: NeighborSearchConfig

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:55](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/shared/NeighborSearchGridLayout.ts#L55)

## Properties

### cellSize

> **cellSize**: `number`

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:59](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/shared/NeighborSearchGridLayout.ts#L59)

Raio de suavização h = tamanho de célula (metros).

***

### dims

> **dims**: \[`number`, `number`, `number`\]

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:61](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/shared/NeighborSearchGridLayout.ts#L61)

Dimensões da grade em células [x, y, z]. n_cells = x*y*z ≤ 65536.

***

### maxNeighbors?

> `optional` **maxNeighbors?**: `number`

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:63](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/shared/NeighborSearchGridLayout.ts#L63)

Número máximo de vizinhos por partícula. Default: 64.

***

### origin

> **origin**: \[`number`, `number`, `number`\]

Defined in: [elements/physics/shared/NeighborSearchGridLayout.ts:57](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/shared/NeighborSearchGridLayout.ts#L57)

Origem do volume de busca em world space.
