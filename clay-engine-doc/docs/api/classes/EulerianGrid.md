# Class: EulerianGrid

Defined in: [elements/physics/shared/EulerianGrid.ts:32](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L32)

## Constructors

### Constructor

> **new EulerianGrid**(`config`): `EulerianGrid`

Defined in: [elements/physics/shared/EulerianGrid.ts:40](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L40)

#### Parameters

##### config

[`EulerianGridConfig`](../interfaces/EulerianGridConfig.md)

#### Returns

`EulerianGrid`

## Properties

### cellCount

> `readonly` **cellCount**: `number`

Defined in: [elements/physics/shared/EulerianGrid.ts:35](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L35)

***

### config

> `readonly` **config**: [`EulerianGridConfig`](../interfaces/EulerianGridConfig.md)

Defined in: [elements/physics/shared/EulerianGrid.ts:34](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L34)

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/shared/EulerianGrid.ts:93](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L93)

#### Returns

`void`

***

### encodeClear()

> **encodeClear**(`encoder`): `void`

Defined in: [elements/physics/shared/EulerianGrid.ts:85](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L85)

Insere clearBuffer do buffer de momentum no encoder.
Deve ser chamado no início de cada frame antes do P2G de MPM e/ou FLIP.

#### Parameters

##### encoder

`GPUCommandEncoder`

#### Returns

`void`

***

### getMomentumBuffer()

> **getMomentumBuffer**(): `GPUBuffer`

Defined in: [elements/physics/shared/EulerianGrid.ts:51](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L51)

Retorna o buffer de momentum (MPMGridNode[], atomic<i32>).
Alocado lazily na primeira chamada.

#### Returns

`GPUBuffer`

***

### getPressureBuffer()

> **getPressureBuffer**(): `GPUBuffer`

Defined in: [elements/physics/shared/EulerianGrid.ts:67](https://github.com/dantasgut/clayflow/blob/da5bfcad6a3bd21b2f5e94930406f86702541470/src/elements/physics/shared/EulerianGrid.ts#L67)

Retorna o buffer de pressão (f32 por célula), exclusivo FLIP.
Alocado lazily na primeira chamada.

#### Returns

`GPUBuffer`
