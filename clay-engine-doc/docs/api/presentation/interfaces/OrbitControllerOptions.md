[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / OrbitControllerOptions

# Interface: OrbitControllerOptions

Defined in: [presentation/input/controllers/OrbitController.ts:8](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L8)

Opções do OrbitController. Todas opcionais com defaults sensíveis.

## Properties

### autoRotate?

> `readonly` `optional` **autoRotate?**: `boolean`

Defined in: [presentation/input/controllers/OrbitController.ts:14](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L14)

Quando true, rotaciona automaticamente sem input do usuário.

***

### autoRotateSpeed?

> `readonly` `optional` **autoRotateSpeed?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:16](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L16)

Radianos/segundo de auto-rotação (se habilitada). Default: 0.5.

***

### damping?

> `readonly` `optional` **damping?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:19](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L19)

Coeficiente de damping em [0, 1]: 0 = sem damping (parada brusca),
1 = sem amortecimento (gira eternamente). Default 0.85.

***

### distance?

> `readonly` `optional` **distance?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:12](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L12)

Distância inicial entre câmera e target (raio do orbit). Default: 5.

***

### pinchSensitivity?

> `readonly` `optional` **pinchSensitivity?**: `number`

Defined in: [presentation/input/controllers/OrbitController.ts:21](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L21)

Sensibilidade do pinch (touch) em distance units por pixel.

***

### target?

> `readonly` `optional` **target?**: readonly \[`number`, `number`, `number`\]

Defined in: [presentation/input/controllers/OrbitController.ts:10](https://github.com/dantasgut/clayflow/blob/4cb09580ef0c9b3c17652ba759cf5b7ea8d0a04d/src/presentation/input/controllers/OrbitController.ts#L10)

Ponto que a câmera orbita. Default: [0, 0, 0] (origem).
