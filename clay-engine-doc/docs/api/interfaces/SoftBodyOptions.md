# Interface: SoftBodyOptions

Defined in: [elements/physics/SoftBody.ts:26](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L26)

## Properties

### compliance?

> `optional` **compliance?**: `number`

Defined in: [elements/physics/SoftBody.ts:28](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L28)

***

### damping?

> `optional` **damping?**: `number`

Defined in: [elements/physics/SoftBody.ts:29](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L29)

***

### mass?

> `optional` **mass?**: `number`

Defined in: [elements/physics/SoftBody.ts:27](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L27)

***

### offset?

> `optional` **offset?**: \[`number`, `number`, `number`\]

Defined in: [elements/physics/SoftBody.ts:43](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L43)

Deslocamento inicial aplicado a todas as partículas (e ao rawVertices),
posicionando o corpo deformável no espaço do mundo sem manipulação
manual de buffers no lado da aplicação.

***

### particleRadius?

> `optional` **particleRadius?**: `number`

Defined in: [elements/physics/SoftBody.ts:36](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L36)

Raio virtual de colisão de cada partícula (metros).
Não altera a geometria visual — apenas expande a distância de contato
com os colisores (collision margin), prevenindo penetração visual.
Default: 0.05.

***

### pinnedIndices?

> `optional` **pinnedIndices?**: readonly `number`[]

Defined in: [elements/physics/SoftBody.ts:49](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L49)

Índices das partículas a fixar (w = 0).
Partículas fixadas não respondem a forças nem a constraints — servem
como âncoras estáticas para pendurar panos, cordas e estruturas.

***

### targetGeometry?

> `optional` **targetGeometry?**: [`Geometry`](../classes/Geometry.md)

Defined in: [elements/physics/SoftBody.ts:37](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SoftBody.ts#L37)
