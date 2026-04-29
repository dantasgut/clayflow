[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / GraphColorSolver

# Class: GraphColorSolver

Defined in: [elements/gpu/GraphColorSolver.ts:6](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/GraphColorSolver.ts#L6)

## Constructors

### Constructor

> **new GraphColorSolver**(): `GraphColorSolver`

#### Returns

`GraphColorSolver`

## Methods

### color()

> `static` **color**(`edges`): `Uint32Array`

Defined in: [elements/gpu/GraphColorSolver.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/GraphColorSolver.ts#L7)

#### Parameters

##### edges

readonly [`Edge`](../interfaces/Edge.md)[]

#### Returns

`Uint32Array`

***

### maxColor()

> `static` **maxColor**(`colors`): `number`

Defined in: [elements/gpu/GraphColorSolver.ts:26](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/elements/gpu/GraphColorSolver.ts#L26)

#### Parameters

##### colors

`Uint32Array`

#### Returns

`number`
