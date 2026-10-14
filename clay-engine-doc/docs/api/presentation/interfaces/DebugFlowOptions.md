[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / DebugFlowOptions

# Interface: DebugFlowOptions

Defined in: [presentation/flows/DebugFlow.ts:23](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/DebugFlow.ts#L23)

Opções do `DebugFlow`.

## Properties

### avgWindow?

> `readonly` `optional` **avgWindow?**: `number`

Defined in: [presentation/flows/DebugFlow.ts:27](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/DebugFlow.ts#L27)

Window de rolling average para frame time (default: 60).

***

### emitStats?

> `readonly` `optional` **emitStats?**: `boolean`

Defined in: [presentation/flows/DebugFlow.ts:25](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/DebugFlow.ts#L25)

Emite `profilerStats` ao fim de cada frame quando enabled (default: true).

***

### toggleKey?

> `readonly` `optional` **toggleKey?**: `string`

Defined in: [presentation/flows/DebugFlow.ts:29](https://github.com/dantasgut/clayflow/blob/d26a3f3c8e017e203a83f183aa41fb2bba647071/src/presentation/flows/DebugFlow.ts#L29)

Tecla que toggla o overlay (default: 'F1').
