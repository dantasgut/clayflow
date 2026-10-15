[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / DebugFlowOptions

# Interface: DebugFlowOptions

Defined in: [presentation/flows/DebugFlow.ts:23](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/DebugFlow.ts#L23)

Opções do `DebugFlow`.

## Properties

### avgWindow?

> `readonly` `optional` **avgWindow?**: `number`

Defined in: [presentation/flows/DebugFlow.ts:27](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/DebugFlow.ts#L27)

Window de rolling average para frame time (default: 60).

***

### emitStats?

> `readonly` `optional` **emitStats?**: `boolean`

Defined in: [presentation/flows/DebugFlow.ts:25](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/DebugFlow.ts#L25)

Emite `profilerStats` ao fim de cada frame quando enabled (default: true).

***

### toggleKey?

> `readonly` `optional` **toggleKey?**: `string`

Defined in: [presentation/flows/DebugFlow.ts:29](https://github.com/dantasgut/clayflow/blob/91d5c3609755b8c4fd2a2f050c89ddc499f6ac6d/src/presentation/flows/DebugFlow.ts#L29)

Tecla que toggla o overlay (default: 'F1').
