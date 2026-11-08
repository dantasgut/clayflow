[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ComposedShader

# Interface: ComposedShader

Defined in: [src/scene/shaders/composeWgsl.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L32)

Resultado da montagem de um shader a partir de um módulo de entrada.

## Properties

### bindings

> `readonly` **bindings**: readonly [`ComposedBinding`](ComposedBinding.md)[]

Defined in: [src/scene/shaders/composeWgsl.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L45)

Ligações dos recursos declarados (spec 031), em ordem de grupo e ligação; vazio em shaders sem recursos.

***

### groupFrequencies

> `readonly` **groupFrequencies**: readonly [`BindingFrequency`](../type-aliases/BindingFrequency.md)[]

Defined in: [src/scene/shaders/composeWgsl.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L47)

Frequência de cada grupo emitido (índice = grupo).

***

### modules

> `readonly` **modules**: readonly `string`[]

Defined in: [src/scene/shaders/composeWgsl.ts:36](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L36)

Módulos incluídos, em ordem.

***

### ranges

> `readonly` **ranges**: `ReadonlyMap`\<`string`, \{ `first`: `number`; `last`: `number`; \}\>

Defined in: [src/scene/shaders/composeWgsl.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L43)

Linhas de cada módulo no fonte montado (1 = primeira linha; intervalo fechado): traduz a linha de uma mensagem
do compilador para a linha no fonte do módulo (`line − first + 1`).

***

### spec

> `readonly` **spec**: [`ShaderModuleSpec`](ShaderModuleSpec.md)

Defined in: [src/scene/shaders/composeWgsl.ts:34](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L34)

Spec do shader (congelada; o mesmo objeto para a mesma entrada — identidade e dedup da 004 preservadas).

***

### symbols

> `readonly` **symbols**: `ReadonlyMap`\<`string`, `string`\>

Defined in: [src/scene/shaders/composeWgsl.ts:38](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/composeWgsl.ts#L38)

Símbolo → dono (`módulo` ou `struct <wgslName>`).
