[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FluidSurfaceFlowOptions

# Interface: FluidSurfaceFlowOptions

Defined in: [presentation/flows/FluidSurfaceFlow.ts:57](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/FluidSurfaceFlow.ts#L57)

Opções do `FluidSurfaceFlow`.

## Properties

### smoothingIterations?

> `readonly` `optional` **smoothingIterations?**: `number`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:61](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/FluidSurfaceFlow.ts#L61)

Iterações da suavização (cada uma = horizontal + vertical; mínimo 1). Padrão 2.

***

### view?

> `readonly` `optional` **view?**: [`WaterView`](../type-aliases/WaterView.md)

Defined in: [presentation/flows/FluidSurfaceFlow.ts:59](https://github.com/dantasgut/clayflow/blob/fc1ab580d2f75a8c5357a3b9ff4fa8127ee6a076/src/presentation/flows/FluidSurfaceFlow.ts#L59)

Vista produzida. Padrão `'camera'`.
