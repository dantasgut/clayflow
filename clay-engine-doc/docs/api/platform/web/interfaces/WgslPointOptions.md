[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslPointOptions

# Interface: WgslPointOptions

Defined in: [src/scene/shaders/WgslPoint.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L37)

Opções de `wgslPoint`.

## Properties

### context?

> `readonly` `optional` **context?**: `"vertex"` \| `"fragment"` \| `"compute"`

Defined in: [src/scene/shaders/WgslPoint.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L47)

Estágio em que a função é avaliada (spec 031: nós só de fragmento valem só em `fragment`). Padrão `compute`.

***

### hosts?

> `readonly` `optional` **hosts?**: () => readonly [`WgslModule`](WgslModule.md)[]

Defined in: [src/scene/shaders/WgslPoint.ts:51](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L51)

Módulos de entrada (kernels) que usam o ponto — a validação monta cada um com a função do usuário.

#### Returns

readonly [`WgslModule`](WgslModule.md)[]

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L39)

Nome do ponto (ex.: `transform`).

***

### optional?

> `readonly` `optional` **optional?**: readonly [`WgslPointSignature`](WgslPointSignature.md)[]

Defined in: [src/scene/shaders/WgslPoint.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L43)

Funções que a implementação pode definir (derivadas, Jacobiana, projeção).

***

### paramsAlias

> `readonly` **paramsAlias**: `string`

Defined in: [src/scene/shaders/WgslPoint.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L45)

Alias do struct de parâmetros que os kernels usam (ex.: `TransformFnParams`).

***

### ready

> `readonly` **ready**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/shaders/WgslPoint.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L49)

Implementação pronta: o módulo que os kernels exigem e que uma função do usuário substitui.

***

### required

> `readonly` **required**: [`WgslPointSignature`](WgslPointSignature.md)

Defined in: [src/scene/shaders/WgslPoint.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L41)

Função obrigatória.

***

### scene?

> `readonly` `optional` **scene?**: [`ScenePointOptions`](ScenePointOptions.md)

Defined in: [src/scene/shaders/WgslPoint.ts:56](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslPoint.ts#L56)

Ponto de cena (ex.: `field`, `space`): as funções inseridas na cena valem para todo pipeline cujo shader contém o
ponto — a C2 compõe as funções (`combine`) e troca o pronto em cada pipeline (spec 009).
