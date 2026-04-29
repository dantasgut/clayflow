# Interface: SPHBodyOptions

Defined in: [elements/physics/SPHBody.ts:10](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L10)

## Properties

### gamma?

> `optional` **gamma?**: `number`

Defined in: [elements/physics/SPHBody.ts:18](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L18)

Expoente γ da EOS WCSPH. Default: 7.

***

### particleMass?

> `optional` **particleMass?**: `number`

Defined in: [elements/physics/SPHBody.ts:24](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L24)

Massa por partícula (kg). Default: 0.02.

***

### restDensity?

> `optional` **restDensity?**: `number`

Defined in: [elements/physics/SPHBody.ts:12](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L12)

Densidade de repouso ρ₀ (kg/m³). Default: 1000.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [elements/physics/SPHBody.ts:26](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L26)

Coeficiente de restituição nas colisões. Default: 0.0.

***

### smoothingRadius?

> `optional` **smoothingRadius?**: `number`

Defined in: [elements/physics/SPHBody.ts:14](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L14)

Raio de suavização h (m). Default: 0.1.

***

### stiffness?

> `optional` **stiffness?**: `number`

Defined in: [elements/physics/SPHBody.ts:16](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L16)

Rigidez da equação de estado k₀ (Pa). Default: 200.

***

### viscosity?

> `optional` **viscosity?**: `number`

Defined in: [elements/physics/SPHBody.ts:20](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L20)

Viscosidade dinâmica μ. Default: 0.01.

***

### xsph?

> `optional` **xsph?**: `number`

Defined in: [elements/physics/SPHBody.ts:22](https://github.com/dantasgut/clayflow/blob/2c41166256c7c7cb583fd49924156206b2c57ab6/src/legacy/elements/physics/SPHBody.ts#L22)

Coeficiente XSPH c. Default: 0.01.
