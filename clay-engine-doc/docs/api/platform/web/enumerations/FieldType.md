[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / FieldType

# Enumeration: FieldType

Defined in: [src/scene/descriptors/FieldType.ts:11](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L11)

FieldType enumera os tipos primitivos suportados em StructSchema. Os
valores correspondem aos nomes WGSL exatos (f32, vec3f, mat4x4f, etc.)
para preservar mapeamento direto JS ↔ shader.

O StructSchema usa estes tipos para calcular layout (size + align) pelas
regras de layout do WGSL, gerar TypedArrays correspondentes, e emitir
WGSL struct definitions sincronizadas com a memória JS. Todos são
host-shareable (não há tipo de 16 bits: o WGSL não tem `u16`/`i16`).

## Enumeration Members

### atomicI32

> **atomicI32**: `"atomicI32"`

Defined in: [src/scene/descriptors/FieldType.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L43)

`atomic<i32>` — 4 bytes, align 4. Só em storage.

***

### atomicU32

> **atomicU32**: `"atomicU32"`

Defined in: [src/scene/descriptors/FieldType.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L41)

`atomic<u32>` — 4 bytes, align 4. Só em storage (contadores, somas em ponto fixo).

***

### f32

> **f32**: `"f32"`

Defined in: [src/scene/descriptors/FieldType.ts:13](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L13)

float32 — 4 bytes, align 4.

***

### i32

> **i32**: `"i32"`

Defined in: [src/scene/descriptors/FieldType.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L33)

int32 — 4 bytes, align 4.

***

### mat3x3f

> **mat3x3f**: `"mat3x3f"`

Defined in: [src/scene/descriptors/FieldType.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L21)

mat3x3 de f32 — 48 bytes (3×16), align 16. Cada coluna ocupa 16 bytes.

***

### mat4x4f

> **mat4x4f**: `"mat4x4f"`

Defined in: [src/scene/descriptors/FieldType.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L23)

mat4x4 de f32 — 64 bytes, align 16.

***

### u32

> **u32**: `"u32"`

Defined in: [src/scene/descriptors/FieldType.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L25)

uint32 — 4 bytes, align 4.

***

### vec2f

> **vec2f**: `"vec2f"`

Defined in: [src/scene/descriptors/FieldType.ts:15](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L15)

vec2 de f32 — 8 bytes, align 8.

***

### vec2i

> **vec2i**: `"vec2i"`

Defined in: [src/scene/descriptors/FieldType.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L35)

vec2 de i32 — 8 bytes, align 8.

***

### vec2u

> **vec2u**: `"vec2u"`

Defined in: [src/scene/descriptors/FieldType.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L27)

vec2 de u32 — 8 bytes, align 8.

***

### vec3f

> **vec3f**: `"vec3f"`

Defined in: [src/scene/descriptors/FieldType.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L17)

vec3 de f32 — 12 bytes, align 16 (WGSL padding).

***

### vec3i

> **vec3i**: `"vec3i"`

Defined in: [src/scene/descriptors/FieldType.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L37)

vec3 de i32 — 12 bytes, align 16.

***

### vec3u

> **vec3u**: `"vec3u"`

Defined in: [src/scene/descriptors/FieldType.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L29)

vec3 de u32 — 12 bytes, align 16.

***

### vec4f

> **vec4f**: `"vec4f"`

Defined in: [src/scene/descriptors/FieldType.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L19)

vec4 de f32 — 16 bytes, align 16.

***

### vec4i

> **vec4i**: `"vec4i"`

Defined in: [src/scene/descriptors/FieldType.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L39)

vec4 de i32 — 16 bytes, align 16.

***

### vec4u

> **vec4u**: `"vec4u"`

Defined in: [src/scene/descriptors/FieldType.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/FieldType.ts#L31)

vec4 de u32 — 16 bytes, align 16.
