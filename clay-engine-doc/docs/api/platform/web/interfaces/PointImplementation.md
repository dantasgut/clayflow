[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PointImplementation

# Interface: PointImplementation

Defined in: [src/scene/shaders/WgslPoint.ts:193](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L193)

Implementação de um ponto composta num shader (a `ExtensionFunction` da cena): o que a C2 usa para traduzir a linha
de um erro do compilador e anunciar a rejeição.

## Properties

### functionName

> `readonly` **functionName**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:206](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L206)

Nome da função obrigatória no módulo (com o sufixo do hash nos pontos de cena).

***

### implemented

> `readonly` **implemented**: `boolean`

Defined in: [src/scene/shaders/WgslPoint.ts:204](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L204)

A implementação tem função própria. `false` (grafo sem saída, spec 031): o módulo é o pronto do ponto e, nos
pontos de cena, a função não entra na composição.

***

### loaderName

> `readonly` **loaderName**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:208](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L208)

Nome do carregador de parâmetros no módulo.

***

### module

> `readonly` **module**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/shaders/WgslPoint.ts:197](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L197)

Módulo gerado do código atual.

***

### point

> `readonly` **point**: [`WgslPoint`](WgslPoint.md)

Defined in: [src/scene/shaders/WgslPoint.ts:195](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L195)

Ponto implementado.

***

### revision

> `readonly` **revision**: `number`

Defined in: [src/scene/shaders/WgslPoint.ts:199](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L199)

Revisão do código.

## Methods

### codeLine()

> **codeLine**(`moduleLine`): `number`

Defined in: [src/scene/shaders/WgslPoint.ts:212](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L212)

Linha no código do usuário de uma linha do módulo (≤ 0: trecho gerado).

#### Parameters

##### moduleLine

`number`

#### Returns

`number`

***

### optionalName()

> **optionalName**(`name`): `string` \| `undefined`

Defined in: [src/scene/shaders/WgslPoint.ts:210](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L210)

Nome no módulo da função opcional `name` do ponto, se a implementação a define (sufixo do hash nos de cena).

#### Parameters

##### name

`string`

#### Returns

`string` \| `undefined`
