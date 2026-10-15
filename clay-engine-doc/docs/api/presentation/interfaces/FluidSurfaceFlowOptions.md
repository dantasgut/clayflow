[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / FluidSurfaceFlowOptions

# Interface: FluidSurfaceFlowOptions

Defined in: [presentation/flows/FluidSurfaceFlow.ts:57](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L57)

Opções do `FluidSurfaceFlow`.

## Properties

### smoothingIterations?

> `readonly` `optional` **smoothingIterations?**: `number`

Defined in: [presentation/flows/FluidSurfaceFlow.ts:61](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L61)

Iterações da suavização (cada uma = horizontal + vertical; mínimo 1). Padrão 2.

***

### view?

> `readonly` `optional` **view?**: [`WaterView`](../type-aliases/WaterView.md)

Defined in: [presentation/flows/FluidSurfaceFlow.ts:59](https://github.com/dantasgut/clayflow/blob/fe51e794a7bd29f3823c3a76721c37005dcd7e7a/src/presentation/flows/FluidSurfaceFlow.ts#L59)

Vista produzida. Padrão `'camera'`.
