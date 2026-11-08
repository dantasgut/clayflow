[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ExtensionGraphOptions

# Interface: ExtensionGraphOptions

Defined in: [src/scene/contracts/ExtensionFunction.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L33)

Opções de uma função de ponto montada por um grafo de nós (spec 031, US2): o código é gerado do grafo (um `let` por
nó), os parâmetros são os dos nós (`nó_parâmetro`) e os módulos, os dos nós.

## Properties

### code?

> `readonly` `optional` **code?**: `undefined`

Defined in: [src/scene/contracts/ExtensionFunction.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L35)

***

### graph

> `readonly` **graph**: [`NodeGraph`](../classes/NodeGraph.md)

Defined in: [src/scene/contracts/ExtensionFunction.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L34)

***

### values?

> `readonly` `optional` **values?**: `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/contracts/ExtensionFunction.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/ExtensionFunction.ts#L37)

Valores iniciais por cima dos do grafo (`nó_parâmetro`).
