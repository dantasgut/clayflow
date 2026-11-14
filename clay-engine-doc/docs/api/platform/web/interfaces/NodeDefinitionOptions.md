[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / NodeDefinitionOptions

# Interface: NodeDefinitionOptions

Defined in: [src/scene/graph/NodeDefinition.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L21)

Opções de `defineNode` (nó de ponto).

## Properties

### code

> `readonly` **code**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/graph/NodeDefinition.ts:40](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L40)

Módulo WGSL com a função do nó (e o struct de saída).

***

### contexts?

> `readonly` `optional` **contexts?**: readonly [`NodeContext`](../type-aliases/NodeContext.md)[]

Defined in: [src/scene/graph/NodeDefinition.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L44)

Estágios em que o nó vale (padrão: todos). Ex.: derivadas de tela só em `fragment`.

***

### defaults?

> `readonly` `optional` **defaults?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L38)

Expressão WGSL de uma entrada sem ligação (ex.: `'0.0'`); entrada sem ligação nem padrão é erro.

***

### fn

> `readonly` **fn**: `string`

Defined in: [src/scene/graph/NodeDefinition.ts:42](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L42)

Nome da função do nó no módulo.

***

### inputs?

> `readonly` `optional` **inputs?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L25)

Entradas: nome → tipo, na ordem dos parâmetros da função.

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/graph/NodeDefinition.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L23)

Nome do nó (único no registro: `noise.gradient3`, `math.add`…).

***

### outputs

> `readonly` **outputs**: `Readonly`\<`Record`\<`string`, [`PortType`](../type-aliases/PortType.md)\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L30)

Saídas: nome → tipo. Uma saída: o retorno da função. Várias: a função devolve um struct cujos campos têm os nomes
e os tipos das saídas.

***

### params?

> `readonly` `optional` **params?**: `Readonly`\<`Record`\<`string`, [`NodeParam`](NodeParam.md)\>\>

Defined in: [src/scene/graph/NodeDefinition.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L36)

Parâmetros: nome → tipo e padrão; entram na função depois das entradas, na ordem declarada. Um parâmetro com o
nome de uma entrada é o **valor da entrada** (spec 011, como no Blender): sem ligação, a entrada usa o parâmetro
(muda sem recompilar, exponível num sub-grafo); ligada, a ligação. Esse parâmetro não é argumento extra da função.

***

### tags?

> `readonly` `optional` **tags?**: readonly `string`[]

Defined in: [src/scene/graph/NodeDefinition.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeDefinition.ts#L50)

Marcas livres do nó (spec 011), unidas pela compilação do grafo (`NodeGraph.tags()`): quem consome o grafo decide
o que significam — ex.: os lobos de espalhamento que um nó de material produz, para especializar o shader. O núcleo
do grafo não interpreta.
