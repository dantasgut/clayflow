# Interface: MPMBodyOptions

Defined in: [elements/physics/MPMBody.ts:12](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L12)

## Properties

### E?

> `optional` **E?**: `number`

Defined in: [elements/physics/MPMBody.ts:16](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L16)

Módulo de Young (Pa). Default: 1e5.

***

### hardening?

> `optional` **hardening?**: `number`

Defined in: [elements/physics/MPMBody.ts:20](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L20)

Coeficiente de hardening exponencial (neve). Default: 10.

***

### mass?

> `optional` **mass?**: `number`

Defined in: [elements/physics/MPMBody.ts:13](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L13)

***

### material?

> `optional` **material?**: [`MPMMaterialType`](../type-aliases/MPMMaterialType.md)

Defined in: [elements/physics/MPMBody.ts:14](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L14)

***

### nu?

> `optional` **nu?**: `number`

Defined in: [elements/physics/MPMBody.ts:18](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L18)

Coeficiente de Poisson. Default: 0.2.

***

### thetaC?

> `optional` **thetaC?**: `number`

Defined in: [elements/physics/MPMBody.ts:22](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L22)

Limite de compressão crítica (neve). Default: 2.5e-2.

***

### thetaS?

> `optional` **thetaS?**: `number`

Defined in: [elements/physics/MPMBody.ts:24](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L24)

Limite de extensão crítica (neve). Default: 7.5e-3.

***

### viscosity?

> `optional` **viscosity?**: `number`

Defined in: [elements/physics/MPMBody.ts:26](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/elements/physics/MPMBody.ts#L26)

Viscosidade dinâmica (fluido). Default: 0.
