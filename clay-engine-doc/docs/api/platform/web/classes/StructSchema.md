[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / StructSchema

# Class: StructSchema

Defined in: [src/scene/descriptors/StructSchema.ts:212](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L212)

StructSchema descreve um struct WGSL — sequência ordenada de campos tipados com layout calculado pelas regras de
layout do WGSL para o espaço de endereço (`storage` ou `uniform`). É a fonte única do layout de um dado de GPU:
  - `stride`/`offsetOf` (tamanho e posição dos campos no buffer);
  - `pack`/`packInto` (serialização de `data`);
  - `toWGSL()` (o struct WGSL correspondente, com `wgslName`, inclusive atributos de layout quando necessário);
  - `vertexLayout` (vértices intercalados compactos das geometrias).
Os três usam o mesmo layout, então empacotamento e WGSL concordam por construção.

Exemplo:
```ts
const camera = new StructSchema('Camera', {
    view: FieldType.mat4x4f,
    position: FieldType.vec4f,
    near: FieldType.f32,
});
camera.stride;  // 96 (mat4 64 + vec4 16 + f32 4, alinhado a 16)
camera.pack({ view: identity, position: [0,0,5,1], near: 0.1 });
```

## Extends

- [`Schema`](../interfaces/Schema.md)

## Constructors

### Constructor

> **new StructSchema**(`name`, `fields`, `options?`): `StructSchema`

Defined in: [src/scene/descriptors/StructSchema.ts:232](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L232)

#### Parameters

##### name

`string`

##### fields

`Record`\<`string`, [`FieldSpec`](../type-aliases/FieldSpec.md)\>

##### options?

[`StructSchemaOptions`](../interfaces/StructSchemaOptions.md) = `{}`

#### Returns

`StructSchema`

#### Overrides

`Schema.constructor`

## Properties

### addressSpace

> `readonly` **addressSpace**: [`AddressSpace`](../type-aliases/AddressSpace.md)

Defined in: [src/scene/descriptors/StructSchema.ts:218](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L218)

Regras de layout seguidas.

***

### align

> `readonly` **align**: `number`

Defined in: [src/scene/descriptors/StructSchema.ts:224](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L224)

Alinhamento do struct (maior alinhamento entre os campos, mínimo 4).

***

### dependencies

> `readonly` **dependencies**: readonly `StructSchema`[]

Defined in: [src/scene/descriptors/StructSchema.ts:226](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L226)

Schemas dos structs aninhados (transitivos), em ordem de dependência.

***

### fields

> `readonly` **fields**: `ReadonlyMap`\<`string`, [`FieldSpec`](../type-aliases/FieldSpec.md)\>

Defined in: [src/scene/descriptors/StructSchema.ts:220](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L220)

Map ordenado nome do campo → tipo. Ordem de inserção preservada.

***

### name

> `readonly` **name**: `string`

Defined in: [src/scene/descriptors/StructSchema.ts:214](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L214)

Nome do schema (pool key; também usado em queries).

#### Overrides

[`Schema`](../interfaces/Schema.md).[`name`](../interfaces/Schema.md#name)

***

### stride

> `readonly` **stride**: `number`

Defined in: [src/scene/descriptors/StructSchema.ts:222](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L222)

Tamanho de uma instância em bytes (alinhado ao maior alinhamento; sem o array em execução, se houver).

#### Overrides

[`Schema`](../interfaces/Schema.md).[`stride`](../interfaces/Schema.md#stride)

***

### wgslName

> `readonly` **wgslName**: `string`

Defined in: [src/scene/descriptors/StructSchema.ts:216](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L216)

Nome do struct no WGSL.

#### Overrides

[`Schema`](../interfaces/Schema.md).[`wgslName`](../interfaces/Schema.md#wgslname)

## Accessors

### vertexLayout

#### Get Signature

> **get** **vertexLayout**(): [`VertexLayout`](../interfaces/VertexLayout.md)

Defined in: [src/scene/descriptors/StructSchema.ts:342](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L342)

Layout de vértice compacto deste schema: atributos na ordem declarada, sem o alinhamento de struct WGSL
(`vec3f` = 12 bytes), `stride` = soma — o formato dos vértices intercalados das geometrias (ex.:
`position vec3f, normal vec3f, uv vec2f` → stride 32). Lança se algum campo não é atributo de vértice
(matrizes, atômicos, tipos compostos).

##### Returns

[`VertexLayout`](../interfaces/VertexLayout.md)

## Methods

### applyDefaults()

> **applyDefaults**(`values`): `Record`\<`string`, `unknown`\>

Defined in: [src/scene/descriptors/StructSchema.ts:364](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L364)

Preenche values ausentes em `values` com defaults (0, vetor de zeros, arrays e structs aninhados com os seus
padrões). Usado nos constructors de Resources para garantir `data` completo.

#### Parameters

##### values

`Record`\<`string`, `unknown`\>

#### Returns

`Record`\<`string`, `unknown`\>

#### Overrides

[`Schema`](../interfaces/Schema.md).[`applyDefaults`](../interfaces/Schema.md#applydefaults)

***

### offsetOf()

> **offsetOf**(`field`): `number`

Defined in: [src/scene/descriptors/StructSchema.ts:320](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L320)

Byte offset do campo dentro do struct. Útil para writes parciais e leitura de volta. Lança se o campo não existe.

#### Parameters

##### field

`string`

#### Returns

`number`

***

### pack()

> **pack**(`data`): `Uint8Array`

Defined in: [src/scene/descriptors/StructSchema.ts:378](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L378)

Serializa `data` num buffer novo com o stride exato do struct (padding zerado). Returns Uint8Array view sobre o
buffer (pronto para core.write).

#### Parameters

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`Uint8Array`

#### Overrides

[`Schema`](../interfaces/Schema.md).[`pack`](../interfaces/Schema.md#pack)

***

### packInto()

> **packInto**(`target`, `byteOffset`, `data`): `void`

Defined in: [src/scene/descriptors/StructSchema.ts:389](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L389)

Serializa `data` em `target` a partir de `byteOffset`, sem alocar: escreve exatamente `stride` bytes (padding
zerado). Campos atômicos recebem o valor inicial como u32/i32; arrays aceitam arrays de números ou de objetos
(structs aninhados).

#### Parameters

##### target

`ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\>

##### byteOffset

`number`

##### data

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### packRange()

> **packRange**(`soa`, `start`, `count`): `Uint8Array`

Defined in: [src/scene/descriptors/StructSchema.ts:432](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L432)

Serializa os registros `start..start+count` de um dado por campo (SoA: cada campo primitivo é um array com
`fieldElements(tipo)` números por registro, no layout do buffer — matrizes com o padding das colunas; campos
compostos são arrays com um valor por registro) em AoS, no layout do `array<T>` do WGSL (spec 008, faixas de
pool). Campo ausente fica com zero, como em `pack`.

#### Parameters

##### soa

`Record`\<`string`, `unknown`\>

##### start

`number`

##### count

`number`

#### Returns

`Uint8Array`

#### Throws

RangeError se um campo tem menos valores que `start + count` registros.

***

### packRangeInto()

> **packRangeInto**(`target`, `byteOffset`, `soa`, `start`, `count`): `void`

Defined in: [src/scene/descriptors/StructSchema.ts:439](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L439)

`packRange` em `target` a partir de `byteOffset`, sem alocar o destino.

#### Parameters

##### target

`ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\>

##### byteOffset

`number`

##### soa

`Record`\<`string`, `unknown`\>

##### start

`number`

##### count

`number`

#### Returns

`void`

***

### toWGSL()

> **toWGSL**(): `string`

Defined in: [src/scene/descriptors/StructSchema.ts:540](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L540)

Emite a definição WGSL `struct <wgslName> { ... }` (só deste struct; os aninhados são emitidos pela montagem a
partir de `dependencies`).

#### Returns

`string`

#### Overrides

[`Schema`](../interfaces/Schema.md).[`toWGSL`](../interfaces/Schema.md#towgsl)

***

### typeOf()

> **typeOf**(`field`): [`FieldSpec`](../type-aliases/FieldSpec.md)

Defined in: [src/scene/descriptors/StructSchema.ts:325](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L325)

Tipo do campo. Lança se o campo não existe.

#### Parameters

##### field

`string`

#### Returns

[`FieldSpec`](../type-aliases/FieldSpec.md)

***

### unpack()

> **unpack**(`source`, `byteOffset?`): `Record`\<`string`, `unknown`\>

Defined in: [src/scene/descriptors/StructSchema.ts:525](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L525)

Lê um registro de `source` a partir de `byteOffset` — o inverso de `packInto`: escalares viram números; vetores,
matrizes e arrays de tamanho fixo viram arrays de números (matrizes com o padding das colunas, como no buffer);
structs aninhados viram objetos. Arrays de tamanho em execução não são lidos.

#### Parameters

##### source

`ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\>

##### byteOffset?

`number` = `0`

#### Returns

`Record`\<`string`, `unknown`\>

***

### unpackRange()

> **unpackRange**(`source`, `count`, `byteOffset?`): `Record`\<`string`, `unknown`\>

Defined in: [src/scene/descriptors/StructSchema.ts:490](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/StructSchema.ts#L490)

Lê `count` registros de `source` a partir de `byteOffset` como dado por campo (SoA) — o inverso de `packRange`:
campos primitivos viram arrays tipados com `fieldElements(tipo)` números por registro; compostos, arrays com um
valor por registro.

#### Parameters

##### source

`ArrayBuffer` \| `ArrayBufferView`\<`ArrayBufferLike`\>

##### count

`number`

##### byteOffset?

`number` = `0`

#### Returns

`Record`\<`string`, `unknown`\>
