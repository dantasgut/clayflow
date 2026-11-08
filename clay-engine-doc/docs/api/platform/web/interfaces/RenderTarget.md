[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / RenderTarget

# Interface: RenderTarget

Defined in: [src/core/contracts/render\_target/RenderTarget.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/render_target/RenderTarget.ts#L10)

Configuração de um render pass — color attachments + depth-stencil
+ opções de query. Passado para `frame.render(target, body)` no início
de cada pass.

## Properties

### colorAttachments

> `readonly` **colorAttachments**: readonly `ColorAttachment`[]

Defined in: [src/core/contracts/render\_target/RenderTarget.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/render_target/RenderTarget.ts#L12)

Lista de color attachments (multi-render-target). 1+ attachment.

***

### depthStencilAttachment?

> `readonly` `optional` **depthStencilAttachment?**: `DepthStencilAttachment`

Defined in: [src/core/contracts/render\_target/RenderTarget.ts:14](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/render_target/RenderTarget.ts#L14)

Depth-stencil attachment (opcional para passes color-only).

***

### maxDrawCount?

> `readonly` `optional` **maxDrawCount?**: `number`

Defined in: [src/core/contracts/render\_target/RenderTarget.ts:16](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/render_target/RenderTarget.ts#L16)

Limite máximo de draw calls neste pass (validation hint).

***

### timestampWrites?

> `readonly` `optional` **timestampWrites?**: `ProfilerTimestampWrites`

Defined in: [src/core/contracts/render\_target/RenderTarget.ts:22](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/core/contracts/render_target/RenderTarget.ts#L22)

Opt-in: timestamp queries no início/fim do pass. O Profiler aloca o QuerySet;
o flow obtém os índices via `core.profiler.timestampWritesFor(first, last)`.
Ignorado se a feature `timestamp-query` não está habilitada no device.
