[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / OrbitControllerOptions

# Interface: OrbitControllerOptions

Defined in: [presentation/input/controllers/OrbitController.ts:5](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L5)

## Properties

### autoRotate?

> `readonly` `optional` **autoRotate?**: `boolean`

Defined in: [presentation/input/controllers/OrbitController.ts:8](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L8)

***

### autoRotateSpeed?

> `readonly` `optional` **autoRotateSpeed?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:9](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L9)

***

### damping?

> `readonly` `optional` **damping?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:12](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L12)

Coeficiente de damping em [0, 1]: 0 = sem damping (parada brusca),
1 = sem amortecimento (gira eternamente). Default 0.85.

***

### distance?

> `readonly` `optional` **distance?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:7](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L7)

***

### pinchSensitivity?

> `readonly` `optional` **pinchSensitivity?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:14](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L14)

Sensibilidade do pinch (touch) em distance units por pixel.

***

### target?

> `readonly` `optional` **target?**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/input/controllers/OrbitController.ts:6](https://github.com/dantasgut/clayflow/blob/118ab558e6968dd49ad5ed91cd5a2040f53db915/src/presentation/input/controllers/OrbitController.ts#L6)
