[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / sharedConstant

# Function: sharedConstant()

## Call Signature

> **sharedConstant**(`name`, `value`, `type`): [`SharedConstant`](../interfaces/SharedConstant.md)\<`number`\>

Defined in: [src/scene/shaders/SharedConstant.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L45)

Cria uma constante compartilhada. Lança se o valor não cabe no tipo.

### Parameters

#### name

`string`

Identificador WGSL (convenção: MAIÚSCULAS).

#### value

`number`

Número (escalares) ou lista (vetores).

#### type

`"f32"` \| `"u32"` \| `"i32"`

Tipo WGSL.

### Returns

[`SharedConstant`](../interfaces/SharedConstant.md)\<`number`\>

## Call Signature

> **sharedConstant**(`name`, `value`, `type`): [`SharedConstant`](../interfaces/SharedConstant.md)\<readonly `number`[]\>

Defined in: [src/scene/shaders/SharedConstant.ts:50](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/SharedConstant.ts#L50)

Cria uma constante compartilhada. Lança se o valor não cabe no tipo.

### Parameters

#### name

`string`

Identificador WGSL (convenção: MAIÚSCULAS).

#### value

readonly `number`[]

Número (escalares) ou lista (vetores).

#### type

`"vec3f"` \| `"vec2f"` \| `"vec4f"`

Tipo WGSL.

### Returns

[`SharedConstant`](../interfaces/SharedConstant.md)\<readonly `number`[]\>
