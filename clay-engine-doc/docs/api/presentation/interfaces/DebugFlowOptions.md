[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / DebugFlowOptions

# Interface: DebugFlowOptions

Defined in: [src/presentation/flows/DebugFlow.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L26)

Opções do `DebugFlow`.

## Properties

### avgWindow?

> `readonly` `optional` **avgWindow?**: `number`

Defined in: [src/presentation/flows/DebugFlow.ts:30](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L30)

Window de rolling average para frame time (default: 60).

***

### emitStats?

> `readonly` `optional` **emitStats?**: `boolean`

Defined in: [src/presentation/flows/DebugFlow.ts:28](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L28)

Emite `profilerStats` ao fim de cada frame quando enabled (default: true).

***

### toggleKey?

> `readonly` `optional` **toggleKey?**: `string`

Defined in: [src/presentation/flows/DebugFlow.ts:32](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/flows/DebugFlow.ts#L32)

Tecla que toggla o overlay (default: 'F1').
