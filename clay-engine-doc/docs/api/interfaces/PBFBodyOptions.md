# Interface: PBFBodyOptions

Defined in: [elements/physics/PBFBody.ts:10](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L10)

## Properties

### epsilon?

> `optional` **epsilon?**: `number`

Defined in: [elements/physics/PBFBody.ts:16](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L16)

Relaxação do constraint (ε). Default: 600.

***

### restDensity?

> `optional` **restDensity?**: `number`

Defined in: [elements/physics/PBFBody.ts:12](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L12)

Densidade de repouso ρ₀ (kg/m³). Default: 1000.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [elements/physics/PBFBody.ts:26](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L26)

Coeficiente de restituição nas colisões. Default: 0.0.

***

### sCorrK?

> `optional` **sCorrK?**: `number`

Defined in: [elements/physics/PBFBody.ts:18](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L18)

Amplitude s_corr (anti-clustering). Default: 0.001.

***

### sCorrN?

> `optional` **sCorrN?**: `number`

Defined in: [elements/physics/PBFBody.ts:20](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L20)

Expoente s_corr. Default: 4.

***

### smoothingRadius?

> `optional` **smoothingRadius?**: `number`

Defined in: [elements/physics/PBFBody.ts:14](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L14)

Raio de suavização h (m). Default: 0.1.

***

### vorticityConfinement?

> `optional` **vorticityConfinement?**: `number`

Defined in: [elements/physics/PBFBody.ts:22](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L22)

Coeficiente vorticity confinement. Default: 0.01.

***

### xsph?

> `optional` **xsph?**: `number`

Defined in: [elements/physics/PBFBody.ts:24](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/PBFBody.ts#L24)

Viscosidade XSPH c. Default: 0.01.
