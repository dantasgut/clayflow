[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / Frame

# Interface: Frame

Defined in: [src/core/contracts/Frame.ts:53](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L53)

Frame é o handle passado pelo `core.record(body)` ao body. Encapsula
o command encoder ativo e expõe APIs para emitir compute/render passes,
copies entre buffers/texturas, debug markers e resolve de timestamps.

Lifecycle: válido apenas dentro do callback `body` de `record`. Após
record retornar, o Frame é descartado e referências viram dangling.

## Properties

### canvasView

> `readonly` **canvasView**: [`TextureViewSpec`](TextureViewSpec.md)

Defined in: [src/core/contracts/Frame.ts:58](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L58)

View do swapchain attachable do canvas. Use como render target
para escrever direto no canvas (após PostFlow no pipeline padrão).

## Methods

### clear()

> **clear**(`buffer`, `offset?`, `size?`): `void`

Defined in: [src/core/contracts/Frame.ts:76](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L76)

Zera `size` bytes de `buffer` a partir de `offset` (default: até o fim) **dentro do fluxo de comandos do
quadro**, na posição em que é chamado. Diferente de `core.write` (que entra na fila antes do quadro inteiro),
permite zerar o mesmo buffer várias vezes no quadro — ex.: contagens atômicas reconstruídas a cada
iteração. `offset` e `size` múltiplos de 4.

#### Parameters

##### buffer

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md)

##### offset?

`number`

##### size?

`number`

#### Returns

`void`

***

### compute()

#### Call Signature

> **compute**(`body`): `void`

Defined in: [src/core/contracts/Frame.ts:61](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L61)

Abre um compute pass (sem label) e passa para o body.

##### Parameters

###### body

(`pass`) => `void`

##### Returns

`void`

#### Call Signature

> **compute**(`label`, `body`): `void`

Defined in: [src/core/contracts/Frame.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L63)

Versão labeled — útil pra Chrome DevTools / RenderDoc / profiler.

##### Parameters

###### label

`string`

###### body

(`pass`) => `void`

##### Returns

`void`

***

### copy()

> **copy**(`src`, `dst`, `size`, `srcOffset?`, `dstOffset?`): `void`

Defined in: [src/core/contracts/Frame.ts:82](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L82)

Copy de buffer → buffer dentro do command encoder. Use para readback
pipelines (storage → staging) e para cell_cursor=cell_start no NS.

#### Parameters

##### src

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md)

##### dst

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md)

##### size

`number`

##### srcOffset?

`number`

##### dstOffset?

`number`

#### Returns

`void`

***

### copyBufferToTexture()

> **copyBufferToTexture**(`src`, `dst`, `layout`, `size`, `options?`): `void`

Defined in: [src/core/contracts/Frame.ts:91](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L91)

Buffer → Texture copy. Útil para upload de bitmap data já em buffer.

#### Parameters

##### src

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md)

##### dst

[`TextureSpec`](TextureSpec.md)

##### layout

`TextureDataLayout`

##### size

`Extent3D`

##### options?

`TextureCopyOptions`

#### Returns

`void`

***

### copyTextureToBuffer()

> **copyTextureToBuffer**(`src`, `dst`, `layout`, `size`, `options?`): `void`

Defined in: [src/core/contracts/Frame.ts:100](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L100)

Texture → Buffer copy. Útil para readback de render target para CPU.

#### Parameters

##### src

[`TextureSpec`](TextureSpec.md)

##### dst

[`AnyBufferSpec`](../type-aliases/AnyBufferSpec.md)

##### layout

`TextureDataLayout`

##### size

`Extent3D`

##### options?

`TextureCopyOptions`

#### Returns

`void`

***

### copyTextureToTexture()

> **copyTextureToTexture**(`src`, `dst`, `size`, `options?`): `void`

Defined in: [src/core/contracts/Frame.ts:109](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L109)

Texture → Texture copy. Para mip generation manual ou downscale.

#### Parameters

##### src

[`TextureSpec`](TextureSpec.md)

##### dst

[`TextureSpec`](TextureSpec.md)

##### size

`Extent3D`

##### options?

`TextureCopyOptions`

#### Returns

`void`

***

### marker()

> **marker**(`label`, `body`): `void`

Defined in: [src/core/contracts/Frame.ts:122](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L122)

Grupo de depuração (`pushDebugGroup`/`popDebugGroup`) em volta de `body`: aparece nas capturas do quadro
(Xcode/Metal, PIX, RenderDoc) e nas mensagens de validação. Grupos aninham; cada passe aberto dentro deles leva o
caminho (`fase/Flow`) no seu par de timestamps, e os tempos por quadro saem agregados por escopo
(`FrameStats.scopesNs`). Sem profiling, só o grupo de depuração.

#### Parameters

##### label

`string`

##### body

() => `void`

#### Returns

`void`

***

### render()

#### Call Signature

> **render**(`target`, `body`): `void`

Defined in: [src/core/contracts/Frame.ts:66](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L66)

Abre um render pass com `target` (color/depth attachments) e passa para o body.

##### Parameters

###### target

[`RenderTarget`](RenderTarget.md)

###### body

(`pass`) => `void`

##### Returns

`void`

#### Call Signature

> **render**(`target`, `label`, `body`): `void`

Defined in: [src/core/contracts/Frame.ts:68](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/Frame.ts#L68)

Versão labeled.

##### Parameters

###### target

[`RenderTarget`](RenderTarget.md)

###### label

`string`

###### body

(`pass`) => `void`

##### Returns

`void`
