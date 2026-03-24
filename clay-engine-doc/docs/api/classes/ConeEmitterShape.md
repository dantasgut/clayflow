# Class: ConeEmitterShape

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:12](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/ConeEmitterShape.ts#L12)

Emissão em cone ao redor do eixo +Y. (Camada 3)

## Param

— semiângulo do cone em radianos (0 = linha, π/2 = hemisfério).

## Param

— raio da base do cone onde as partículas nascem (0 = ápice).

## Example

```ts
new ConeEmitterShape(Math.PI / 8, 0.2) // cone estreito, base pequena
```

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new ConeEmitterShape**(`angle?`, `radius?`): `ConeEmitterShape`

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:15](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/ConeEmitterShape.ts#L15)

#### Parameters

##### angle?

`number` = `...`

##### radius?

`number` = `0`

#### Returns

`ConeEmitterShape`

## Properties

### angle

> **angle**: `number`

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:16](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/ConeEmitterShape.ts#L16)

***

### id

> `readonly` **id**: `"cone"` = `'cone'`

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:13](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/ConeEmitterShape.ts#L13)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`id`](../interfaces/EmitterShape.md#id)

***

### radius

> **radius**: `number` = `0`

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:17](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/ConeEmitterShape.ts#L17)

## Methods

### sample()

> **sample**(): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/ConeEmitterShape.ts:20](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/ConeEmitterShape.ts#L20)

Gera uma posição e direção inicial no espaço local do emitter.

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
