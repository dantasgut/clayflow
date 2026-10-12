# Contrato — Structs gerados do `StructSchema`

## `StructSchema` (C2, `scene/descriptors/StructSchema.ts`)

```ts
type FieldSpec =
  | FieldType // primitivo: f32, vec2f…vec4f, mat3x3f, mat4x4f, u32, vec2u…vec4u, i32, vec2i…vec4i, atomicU32, atomicI32
  | ArrayFieldSpec // fieldArray(elem, n)
  | StructFieldSpec // fieldStruct(schema)
  | RuntimeArrayFieldSpec; // fieldRuntimeArray(elem) — último campo, só storage

class StructSchema extends Schema {
  constructor(
    name: string, // pool key (inalterado)
    fields: Record<string, FieldSpec>,
    options?: { wgslName?: string; addressSpace?: 'storage' | 'uniform' },
  );
  readonly wgslName: string;
  readonly addressSpace: 'storage' | 'uniform';
  readonly stride: number;
  offsetOf(field: string): number;
  pack(data: Record<string, unknown>): Uint8Array;
  packInto(
    target: ArrayBufferView | ArrayBuffer,
    byteOffset: number,
    data: Record<string, unknown>,
  ): void;
  toWGSL(): string;
  applyDefaults(values: Record<string, unknown>): Record<string, unknown>;
  readonly vertexLayout: VertexLayout; // inalterado (rejeita matrizes, atômicos e compostos)
}
```

Regras:

- Layout pelas regras de WGSL do `addressSpace` (tabela em [data-model.md](../data-model.md)); `offsetOf`, `stride`,
  `pack`, `packInto` e `toWGSL` usam o mesmo layout — concordância por construção.
- `uniform` com `atomicU32`/`atomicI32` ou `fieldRuntimeArray` → `TypeError` na construção, nomeando o campo.
- `fieldRuntimeArray` fora da última posição → `TypeError`.
- `wgslName` precisa ser identificador WGSL válido e não reservado → `TypeError`.
- `toWGSL()`: `struct <wgslName> {\n    campo: tipo,\n}` com tipos curtos (`vec3f`, `mat4x4f`, `atomic<u32>`,
  `array<vec4f, 8>`, `array<u32>`), structs aninhados por `wgslName` (o struct aninhado é emitido pela montagem como
  dependência do schema pai).
- `packInto` escreve exatamente `stride` bytes a partir de `byteOffset` (padding zerado); campo atômico é empacotado
  como u32/i32 (valor inicial); arrays aceitam arrays de números ou de objetos (struct aninhado); `pack` aloca e chama
  `packInto`.
- `u16`/`i16` removidos de `FieldType` (mudança incompatível documentada; nenhum schema os usa).

## Marcadores `{{struct:Nome}}`

- Em qualquer `WgslModule`: declara uso explícito do struct `Nome`; a montagem valida (`struct-marker`) e remove.
- O schema deve estar em `structs` do módulo ou de uma dependência.
- O struct é emitido uma vez por shader, no topo, independentemente de quantos módulos o marquem.

## `PerStepUniforms` (C3, `elements/physics/flows/PerStepUniforms.ts`)

```ts
class PerStepUniforms<S extends StructSchema> {
  constructor(core: EngineCore, options: { discriminator: string; schema: S }); // schema.addressSpace === 'uniform'
  readonly regionSize: number; // roundUp(schema.stride, minUniformBufferOffsetAlignment)
  reserve(count: number): boolean; // true ⇒ bind groups devem ser recriados (inalterado)
  offset(i: number): number;
  write(i: number, data: Record<string, unknown>): void; // schema.packInto na região i
  flush(count: number): void;
  binding(b: number): ComputeKernelBinding; // size = schema.stride, hasDynamicOffset
}
```

- `f32(i)`/`u32(i)` removidos; nenhum Flow escreve por índice numérico.

## Leitura de volta

- Quem lê buffers de volta usa `schema.offsetOf(campo)` e `schema.stride` (ex.: `LCPFlow` lê `pos`/`rot` de cada
  `RigidBody` por `offsetOf`, não por `LCP_BODY_STRIDE_F32`).
