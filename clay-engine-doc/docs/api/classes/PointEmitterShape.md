# Class: PointEmitterShape

Defined in: [elements/particles/shapes/PointEmitterShape.ts:7](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/PointEmitterShape.ts#L7)

Emissão pontual — todas as partículas nascem na origem local. (Camada 3)
Direção uniformemente distribuída em hemisfério superior por padrão.

## Implements

- [`EmitterShape`](../interfaces/EmitterShape.md)

## Constructors

### Constructor

> **new PointEmitterShape**(): `PointEmitterShape`

#### Returns

`PointEmitterShape`

## Properties

### id

> `readonly` **id**: `"point"` = `'point'`

Defined in: [elements/particles/shapes/PointEmitterShape.ts:8](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/PointEmitterShape.ts#L8)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`id`](../interfaces/EmitterShape.md#id)

## Methods

### sample()

> **sample**(): [`SpawnSample`](../interfaces/SpawnSample.md)

Defined in: [elements/particles/shapes/PointEmitterShape.ts:10](https://github.com/dantasgut/clayflow/blob/a1666043080ae3b3e0982d5e31ab5afdc5a5a4a4/src/elements/particles/shapes/PointEmitterShape.ts#L10)

Gera uma posição e direção inicial no espaço local do emitter.

#### Returns

[`SpawnSample`](../interfaces/SpawnSample.md)

#### Implementation of

[`EmitterShape`](../interfaces/EmitterShape.md).[`sample`](../interfaces/EmitterShape.md#sample)
