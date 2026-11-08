[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / NodeGraph

# Class: NodeGraph

Defined in: [src/scene/graph/NodeGraph.ts:130](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L130)

Grafo de nós (spec 031): nós ligados por portas tipadas. Imutável; validado na criação — nós e portas existentes,
uma ligação por entrada, toda entrada ligada ou com padrão, conjuntos ligados a conjuntos do mesmo tipo, sem ciclos
(com o caminho). De ponto (US2): avaliado por amostra, compilado para um ponto alvo (`compile`, que confere tipos e
estágios). De conjunto (US3): nós de conjunto em ordem (`setOrder`), com os grafos de ponto das entradas de ponto
(`pointGraphFor`) fundidos nos kernels — o `SetGraph` o executa. A identidade é a forma: definições, ligações e
saída; os valores dos parâmetros não entram (mudar um valor não recompila).

## Constructors

### Constructor

> **new NodeGraph**(`options`): `NodeGraph`

Defined in: [src/scene/graph/NodeGraph.ts:145](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L145)

#### Parameters

##### options

[`NodeGraphOptions`](../interfaces/NodeGraphOptions.md)

#### Returns

`NodeGraph`

## Properties

### flatLinks

> `readonly` **flatLinks**: readonly [`GraphLink`](../type-aliases/GraphLink.md)[]

Defined in: [src/scene/graph/NodeGraph.ts:143](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L143)

Ligações com os sub-grafos de conjunto expandidos.

***

### flatNodes

> `readonly` **flatNodes**: `Readonly`\<`Record`\<`string`, [`FlatNode`](../type-aliases/FlatNode.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:141](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L141)

Nós com os sub-grafos de conjunto expandidos (`uso_nó`).

***

### links

> `readonly` **links**: readonly [`GraphLink`](../type-aliases/GraphLink.md)[]

Defined in: [src/scene/graph/NodeGraph.ts:132](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L132)

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, [`GraphNode`](../type-aliases/GraphNode.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:131](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L131)

***

### open

> `readonly` **open**: readonly `string`[]

Defined in: [src/scene/graph/NodeGraph.ts:135](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L135)

Entradas de conjunto abertas (fronteira de sub-grafo).

***

### output

> `readonly` **output**: `string` \| `undefined`

Defined in: [src/scene/graph/NodeGraph.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L133)

## Methods

### allParams()

> **allParams**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:282](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L282)

Parâmetros (`nó_parâmetro` → tipo) de todos os nós com definição, na ordem de declaração.

#### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

***

### allValues()

> **allValues**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:294](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L294)

Valores iniciais (o uso, ou o padrão) dos parâmetros de todos os nós com definição.

#### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

***

### compile()

> **compile**(`point`): `string`

Defined in: [src/scene/graph/NodeGraph.ts:361](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L361)

Código WGSL da função do ponto `point` a partir do grafo (spec 031, R9): um `let` por nó, em ordem topológica — cada
nó avaliado uma vez por amostra, mesmo com a saída usada em vários lugares —, os argumentos do ponto pelos nomes da
assinatura e os parâmetros pelo struct do ponto (`data.nó_parâmetro`).

#### Parameters

##### point

[`PointTarget`](../type-aliases/PointTarget.md)

#### Returns

`string`

#### Throws

NodeGraphError tipos incompatíveis, argumento inexistente, nó fora do estágio do ponto, saída de tipo
  diferente do retorno do ponto.

***

### modules()

> **modules**(): readonly [`WgslModule`](../interfaces/WgslModule.md)[]

Defined in: [src/scene/graph/NodeGraph.ts:344](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L344)

Módulos dos nós de que a saída depende (cada um uma vez).

#### Returns

readonly [`WgslModule`](../interfaces/WgslModule.md)[]

***

### node()

> **node**(`id`): [`ResolvedNode`](../interfaces/ResolvedNode.md)

Defined in: [src/scene/graph/NodeGraph.ts:215](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L215)

Nó resolvido pelo id.

#### Parameters

##### id

`string`

#### Returns

[`ResolvedNode`](../interfaces/ResolvedNode.md)

***

### order()

> **order**(): readonly `string`[]

Defined in: [src/scene/graph/NodeGraph.ts:220](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L220)

Ids dos nós de que a saída depende, em ordem topológica (dependências antes).

#### Returns

readonly `string`[]

***

### params()

> **params**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:308](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L308)

Parâmetros do grafo (`nó_parâmetro` → tipo) dos nós de que a saída depende, em ordem.

#### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

***

### pointGraphFor()

> **pointGraphFor**(`input`): `NodeGraph` \| `undefined`

Defined in: [src/scene/graph/NodeGraph.ts:261](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L261)

O grafo de ponto ligado à entrada de ponto `nó.porta` de um nó de conjunto: os nós de ponto e argumentos de que a
origem depende, com a origem como saída; `undefined` sem ligação.

#### Parameters

##### input

`string`

#### Returns

`NodeGraph` \| `undefined`

***

### setOrder()

> **setOrder**(): readonly `string`[]

Defined in: [src/scene/graph/NodeGraph.ts:238](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L238)

Ids dos nós de conjunto em ordem topológica (dependências antes; empates pela ordem de declaração).

#### Returns

readonly `string`[]

***

### sourceOf()

> **sourceOf**(`input`): `string` \| `undefined`

Defined in: [src/scene/graph/NodeGraph.ts:210](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L210)

A origem ligada à entrada `nó.porta`, ou `undefined`.

#### Parameters

##### input

`string`

#### Returns

`string` \| `undefined`

***

### tags()

> **tags**(): `ReadonlySet`\<`string`\>

Defined in: [src/scene/graph/NodeGraph.ts:336](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L336)

União das marcas (`tags`) dos nós do grafo (spec 011), sub-grafos inclusive: o consumidor do grafo as interpreta
(ex.: a máscara de lobos de um material). Nós sem marca não contribuem.

#### Returns

`ReadonlySet`\<`string`\>

***

### values()

> **values**(): `Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>

Defined in: [src/scene/graph/NodeGraph.ts:319](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/graph/NodeGraph.ts#L319)

Valores iniciais dos parâmetros (o uso, ou o padrão da definição).

#### Returns

`Readonly`\<`Record`\<`string`, [`ExtensionParamValue`](../type-aliases/ExtensionParamValue.md)\>\>
