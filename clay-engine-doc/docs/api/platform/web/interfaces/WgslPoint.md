[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslPoint

# Interface: WgslPoint

Defined in: [src/scene/shaders/WgslPoint.ts:95](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L95)

Ponto de extensão matemático (spec 009): uma função de assinatura fixa que um estágio chama e que o usuário pode
escrever. Os kernels exigem o módulo pronto (`ready`); `bindPoints` troca esse módulo pelo do usuário antes da
montagem, e `check` valida a troca na criação — nunca por quadro.

## Properties

### context

> `readonly` **context**: `"vertex"` \| `"fragment"` \| `"compute"`

Defined in: [src/scene/shaders/WgslPoint.ts:111](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L111)

Estágio em que a função é avaliada.

***

### hosts

> `readonly` **hosts**: () => readonly [`WgslModule`](WgslModule.md)[]

Defined in: [src/scene/shaders/WgslPoint.ts:107](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L107)

Kernels que usam o ponto.

#### Returns

readonly [`WgslModule`](WgslModule.md)[]

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L97)

Nome do ponto.

***

### optional

> `readonly` **optional**: readonly [`WgslPointSignature`](WgslPointSignature.md)[]

Defined in: [src/scene/shaders/WgslPoint.ts:101](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L101)

Funções opcionais.

***

### paramsAlias

> `readonly` **paramsAlias**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L103)

Alias do struct de parâmetros.

***

### ready

> `readonly` **ready**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/shaders/WgslPoint.ts:105](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L105)

Implementação pronta.

***

### required

> `readonly` **required**: [`WgslPointSignature`](WgslPointSignature.md)

Defined in: [src/scene/shaders/WgslPoint.ts:99](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L99)

Função obrigatória.

***

### scene

> `readonly` **scene**: [`ScenePointOptions`](ScenePointOptions.md) \| `undefined`

Defined in: [src/scene/shaders/WgslPoint.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L109)

Ponto de cena (funções compostas para a cena inteira); `undefined` nos pontos por entidade.

## Methods

### check()

> **check**(`module`, `paramsStruct`): `void`

Defined in: [src/scene/shaders/WgslPoint.ts:118](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L118)

Valida a implementação `module` (struct de parâmetros `paramsStruct`): a função obrigatória existe com a
assinatura; as opcionais definidas têm a assinatura; cada kernel monta com ela (sem símbolo em conflito nem
chamada sem definição). Lança `WgslCompositionError` (`point-signature`, `symbol-conflict`, …) nomeando o
ponto, o esperado e o recebido.

#### Parameters

##### module

[`WgslModule`](WgslModule.md)

##### paramsStruct

`string`

#### Returns

`void`

***

### isRecord()

> **isRecord**(`schema`): `boolean`

Defined in: [src/scene/shaders/WgslPoint.ts:128](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L128)

`schema` é o registro de alguma forma deste ponto (o que os estágios escutam: `Flow.listens`)?

#### Parameters

##### schema

[`Schema`](Schema.md)

#### Returns

`boolean`

***

### optionalIn()

> **optionalIn**(`module`): readonly [`WgslPointSignature`](WgslPointSignature.md)[]

Defined in: [src/scene/shaders/WgslPoint.ts:120](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L120)

As funções opcionais que `module` define.

#### Parameters

##### module

[`WgslModule`](WgslModule.md)

#### Returns

readonly [`WgslPointSignature`](WgslPointSignature.md)[]

***

### record()

> **record**(`params`): [`PointRecord`](PointRecord.md)

Defined in: [src/scene/shaders/WgslPoint.ts:126](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L126)

Registro tipado da forma `params` (spec 031, R8): um struct por forma, memorizado — a mesma forma (mesmos nomes e
tipos, na ordem) dá o mesmo schema e o mesmo pool, quaisquer que sejam os valores.

#### Parameters

##### params

`Readonly`\<`Record`\<`string`, [`ExtensionParamType`](../type-aliases/ExtensionParamType.md)\>\>

#### Returns

[`PointRecord`](PointRecord.md)

#### Throws

TypeError nome de parâmetro inválido ou reservado (`revision`), ou tipo não suportado.
