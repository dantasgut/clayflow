[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / ResolvedSource

# Type Alias: ResolvedSource

> **ResolvedSource** = \{ `buffer`: [`BindableBufferSpec`](BindableBufferSpec.md); `dynamic?`: \{ `stride`: `number`; \}; `kind`: `"buffer"`; `offset?`: `number`; `size?`: `number`; `visibility?`: `number`; \} \| \{ `format?`: `GPUTextureFormat`; `kind`: `"textureView"`; `view`: [`TextureViewSpec`](../interfaces/TextureViewSpec.md); `visibility?`: `number`; \} \| \{ `channel`: `ChannelSource`; `epoch`: `number`; `kind`: `"channel"`; `lag`: `number`; `visibility?`: `number`; \} \| \{ `kind`: `"sampler"`; `sampler`: [`SamplerSpec`](../interfaces/SamplerSpec.md); `visibility?`: `number`; \}

Defined in: [src/scene/consumers/ResolvedSource.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/consumers/ResolvedSource.ts#L16)

Fonte de um binding: o objeto de GPU que ocupa um `@binding` do shader. O índice do binding vem do WGSL (inferido
pela C2), nunca da fonte. Uma fonte é identificada pelos specs que carrega: quando o objeto é recriado (pool que
cresce, textura do canvas redimensionada), a fonte muda e a C2 recria os bind groups que a usam.

## Union Members

### Type Literal

\{ `buffer`: [`BindableBufferSpec`](BindableBufferSpec.md); `dynamic?`: \{ `stride`: `number`; \}; `kind`: `"buffer"`; `offset?`: `number`; `size?`: `number`; `visibility?`: `number`; \}

#### buffer

> `readonly` **buffer**: [`BindableBufferSpec`](BindableBufferSpec.md)

O buffer ligado.

#### dynamic?

> `readonly` `optional` **dynamic?**: `object`

Ligado com offset dinâmico: o desenho/despacho escolhe o registro por `setBindGroup(g, bg, [k × stride])`
(ex.: pool uniforme de materiais, uniforms por passo).

##### dynamic.stride

> `readonly` **stride**: `number`

Distância em bytes entre registros (alinhada a `minUniformBufferOffsetAlignment`).

#### kind

> `readonly` **kind**: `"buffer"`

Fonte de buffer.

#### offset?

> `readonly` `optional` **offset?**: `number`

Início da região ligada (bytes). Default 0.

#### size?

> `readonly` `optional` **size?**: `number`

Bytes visíveis pelo shader. Default: o buffer inteiro; obrigatório com `dynamic`.

#### visibility?

> `readonly` `optional` **visibility?**: `number`

Visibilidade explícita (descritor do Resource); vence a inferida (FR-013).

***

### Type Literal

\{ `format?`: `GPUTextureFormat`; `kind`: `"textureView"`; `view`: [`TextureViewSpec`](../interfaces/TextureViewSpec.md); `visibility?`: `number`; \}

#### format?

> `readonly` `optional` **format?**: `GPUTextureFormat`

Formato da textura, para escolher `unfilterable-float` em formatos não filtráveis.

#### kind

> `readonly` **kind**: `"textureView"`

Fonte de textura.

#### view

> `readonly` **view**: [`TextureViewSpec`](../interfaces/TextureViewSpec.md)

A view ligada.

#### visibility?

> `readonly` `optional` **visibility?**: `number`

Visibilidade explícita; vence a inferida.

***

### Type Literal

\{ `channel`: `ChannelSource`; `epoch`: `number`; `kind`: `"channel"`; `lag`: `number`; `visibility?`: `number`; \}

#### channel

> `readonly` **channel**: `ChannelSource`

O canal.

#### epoch

> `readonly` **epoch**: `number`

`epoch` do canal na resolução: fatias recriadas mudam a fonte.

#### kind

> `readonly` **kind**: `"channel"`

Fonte de canal temporal (spec 037): a fatia do atraso `lag` do anel. O bind group do grupo tem uma fase por
cabeça do anel, criada uma vez; a C2 escolhe a do quadro ao gravar (sem cópia, sem pipeline por paridade).

#### lag

> `readonly` **lag**: `number`

Atraso da fatia ligada (0 = a atual).

#### visibility?

> `readonly` `optional` **visibility?**: `number`

Visibilidade explícita; vence a inferida.

***

### Type Literal

\{ `kind`: `"sampler"`; `sampler`: [`SamplerSpec`](../interfaces/SamplerSpec.md); `visibility?`: `number`; \}

#### kind

> `readonly` **kind**: `"sampler"`

Fonte de sampler.

#### sampler

> `readonly` **sampler**: [`SamplerSpec`](../interfaces/SamplerSpec.md)

O sampler ligado.

#### visibility?

> `readonly` `optional` **visibility?**: `number`

Visibilidade explícita; vence a inferida.
