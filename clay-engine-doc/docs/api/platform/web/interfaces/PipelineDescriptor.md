[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / PipelineDescriptor

# Interface: PipelineDescriptor

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:27](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L27)

Pipeline declarado por um Flow (ou pelo material que um Flow desenha). Diferente de `ComputePipelineSpec` /
`RenderPipelineSpec` (Camada 1, materializáveis), é declarativo: a Camada 2 monta o WGSL (`composeWgsl`, que emite
as ligações dos recursos declarados pelos módulos — spec 031), infere as visibilidades, resolve a fonte de cada
recurso pelo fornecedor declarado (pool, resolver da cena, slot do Flow, ponto de cena, ou privado do Flow) e cria
layouts, pipeline e bind groups.

Compute: uma entrada (`entryPoints[0]`). Render: a entrada `@vertex` e, opcional, a `@fragment`.

## Properties

### bindings?

> `readonly` `optional` **bindings?**: `Readonly`\<`Record`\<`string`, \{ `visibility?`: `number`; \}\>\>

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:77](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L77)

Ajustes explícitos por variável WGSL; vencem a inferência (FR-013). Ex.: `{ params: { visibility:
GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT } }`.

***

### colorTargets?

> `readonly` `optional` **colorTargets?**: readonly `ColorTargetSpec`[]

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:47](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L47)

Color targets (apenas render). Default: 1 target com canvas format.

***

### constants?

> `readonly` `optional` **constants?**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:57](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L57)

Constantes `override` do shader (spec 031): variantes sem remendo de texto.

***

### cullMode?

> `readonly` `optional` **cullMode?**: `GPUCullMode`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:39](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L39)

Cull mode (apenas render). Default: 'none'.

***

### depth?

> `readonly` `optional` **depth?**: `DepthSpec`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:43](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L43)

Depth-stencil config (apenas render). Default: nenhum depth attachment.

***

### entryPoints

> `readonly` **entryPoints**: readonly `string`[]

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:35](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L35)

Nomes das funções `@compute`/`@vertex`/`@fragment` no source.

***

### extensions?

> `readonly` `optional` **extensions?**: readonly [`PointImplementation`](PointImplementation.md)[]

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:72](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L72)

Funções de ponto compostas no shader (para traduzir a linha do erro e anunciar a rejeição de cada uma).

***

### family?

> `readonly` `optional` **family?**: `string`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:62](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L62)

Família de desenho (spec 031): como as entidades com este pipeline são desenhadas (`surface`, `points`, `wire`,
`particle-sprite`, `fluid-surface`) — os estágios selecionam por ela, não pelo tipo de outros Resources.

***

### frontFace?

> `readonly` `optional` **frontFace?**: `GPUFrontFace`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L41)

Front-face winding (apenas render). Default: 'ccw'.

***

### id

> `readonly` **id**: `string`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:29](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L29)

Identificador único do pipeline (e.g. 'pipeline_standard', 'pipeline_lcp_predict').

***

### multisample?

> `readonly` `optional` **multisample?**: `MultisampleSpec`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:45](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L45)

Multisample config (apenas render). Default: count=1.

***

### pools?

> `readonly` `optional` **pools?**: `ReadonlyMap`\<[`WgslResource`](WgslResource.md) \| [`ArenaReader`](ArenaReader.md), `string`\>

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L55)

Pool de cada recurso neste pipeline, quando difere do fornecedor declarado (spec 031): ex. um material com pool
próprio que usa o shader do forward liga o seu pool no recurso `materials` do shader. Substitui `{ name, as }`.
Num leitor da arena de pools (T060i), a C2 põe o pool na arena e troca a região do leitor (a constante dele).

***

### preferAsync?

> `readonly` `optional` **preferAsync?**: `boolean`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L64)

Quando true, usa `core.createAsync` (compilação não-bloqueante).

***

### role

> `readonly` **role**: `PipelineDescriptorRole`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:31](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L31)

Tipo do pipeline ('compute' para GPGPU, 'render' para vertex+fragment).

***

### shader

> `readonly` **shader**: [`WgslModule`](WgslModule.md)

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L33)

Módulo WGSL de entrada (montado por `composeWgsl`) que define todos os entry points listados.

***

### topology?

> `readonly` `optional` **topology?**: `GPUPrimitiveTopology`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:37](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L37)

Topologia da primitive (apenas render pipelines). Default: triangle-list.

***

### verify?

> `readonly` `optional` **verify?**: `boolean`

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L70)

Shader com código de fora (funções de ponto de extensão, spec 009): o compilador confere o fonte antes de criar
o módulo (`core.shaderMessages`) e o pipeline compila em segundo plano. Rejeitado, o pipeline não fica pronto,
o Flow recebe `pipelineRejected` e a cena anuncia `extensionRejected` — nenhum erro chega ao device.

***

### vertexBuffers?

> `readonly` `optional` **vertexBuffers?**: readonly `VertexBufferLayout`[]

Defined in: [src/scene/descriptors/PipelineDescriptor.ts:49](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/descriptors/PipelineDescriptor.ts#L49)

Vertex buffer layouts (apenas render). Default: nenhum (vértices lidos como storage).
