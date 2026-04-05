# Interface: SoftParticle

Defined in: [elements/physics/SoftBody.ts:6](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L6)

## Properties

### px

> **px**: `number`

Defined in: [elements/physics/SoftBody.ts:8](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L8)

***

### py

> **py**: `number`

Defined in: [elements/physics/SoftBody.ts:8](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L8)

***

### pz

> **pz**: `number`

Defined in: [elements/physics/SoftBody.ts:8](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L8)

***

### vx

> **vx**: `number`

Defined in: [elements/physics/SoftBody.ts:9](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L9)

***

### vy

> **vy**: `number`

Defined in: [elements/physics/SoftBody.ts:9](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L9)

***

### vz

> **vz**: `number`

Defined in: [elements/physics/SoftBody.ts:9](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L9)

***

### w

> **w**: `number`

Defined in: [elements/physics/SoftBody.ts:16](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L16)

Flag de mobilidade: 0 = fixada (kinematic), 1 = livre.
O invMass físico real é derivado em runtime: `0` se fixada,
`particles.length / body.get('mass')` se livre.
Isso garante que `body.set('mass', x)` seja efetivo a qualquer momento.

***

### x

> **x**: `number`

Defined in: [elements/physics/SoftBody.ts:7](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L7)

***

### y

> **y**: `number`

Defined in: [elements/physics/SoftBody.ts:7](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L7)

***

### z

> **z**: `number`

Defined in: [elements/physics/SoftBody.ts:7](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/elements/physics/SoftBody.ts#L7)
