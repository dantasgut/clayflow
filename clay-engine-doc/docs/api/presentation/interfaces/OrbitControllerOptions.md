[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / OrbitControllerOptions

# Interface: OrbitControllerOptions

Defined in: [src/presentation/input/controllers/OrbitController.ts:8](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L8)

Opções do OrbitController. Todas opcionais com defaults sensíveis.

## Properties

### autoRotate?

> `readonly` `optional` **autoRotate?**: `boolean`

Defined in: [src/presentation/input/controllers/OrbitController.ts:19](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L19)

Quando true, rotaciona automaticamente sem input do usuário.

***

### autoRotateSpeed?

> `readonly` `optional` **autoRotateSpeed?**: `number`

Defined in: [src/presentation/input/controllers/OrbitController.ts:21](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L21)

Radianos/segundo de auto-rotação (se habilitada). Default: 0.5.

***

### damping?

> `readonly` `optional` **damping?**: `number`

Defined in: [src/presentation/input/controllers/OrbitController.ts:24](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L24)

Coeficiente de damping em [0, 1]: 0 = sem damping (parada brusca),
1 = sem amortecimento (gira eternamente). Default 0.85.

***

### distance?

> `readonly` `optional` **distance?**: `number`

Defined in: [src/presentation/input/controllers/OrbitController.ts:12](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L12)

Distância inicial entre câmera e target (raio do orbit). Default: 5.

***

### eye?

> `readonly` `optional` **eye?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/presentation/input/controllers/OrbitController.ts:17](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L17)

Posição inicial da câmera: a órbita começa nela (a distância e os ângulos dela em torno do alvo; ignora
`distance`) — quem assume uma câmera parada não a faz saltar.

***

### pinchSensitivity?

> `readonly` `optional` **pinchSensitivity?**: `number`

Defined in: [src/presentation/input/controllers/OrbitController.ts:26](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L26)

Sensibilidade do pinch (touch) em distance units por pixel.

***

### target?

> `readonly` `optional` **target?**: readonly \[`number`, `number`, `number`\]

Defined in: [src/presentation/input/controllers/OrbitController.ts:10](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/input/controllers/OrbitController.ts#L10)

Ponto que a câmera orbita. Default: [0, 0, 0] (origem).
