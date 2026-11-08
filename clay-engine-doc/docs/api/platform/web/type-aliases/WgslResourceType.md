[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / WgslResourceType

# Type Alias: WgslResourceType

> **WgslResourceType** = \{ `array?`: `boolean`; `schema`: [`StructSchema`](../classes/StructSchema.md); \} \| \{ `array?`: `boolean`; `wgsl`: `string`; \}

Defined in: [src/scene/shaders/WgslResource.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/shaders/WgslResource.ts#L58)

Tipo do dado de um buffer: struct gerado de schema (opcionalmente em `array`) ou tipo WGSL.

## Union Members

### Type Literal

\{ `array?`: `boolean`; `schema`: [`StructSchema`](../classes/StructSchema.md); \}

#### array?

> `readonly` `optional` **array?**: `boolean`

`array<Struct>` (runtime-sized).

#### schema

> `readonly` **schema**: [`StructSchema`](../classes/StructSchema.md)

Schema do struct.

***

### Type Literal

\{ `array?`: `boolean`; `wgsl`: `string`; \}

#### array?

> `readonly` `optional` **array?**: `boolean`

`array<T>` (runtime-sized).

#### wgsl

> `readonly` **wgsl**: `string`

Tipo WGSL (ex.: `u32`, `vec4f`, `atomic<u32>`).
