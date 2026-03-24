# Interface: Force

Defined in: [scene/systems/forces/Force.ts:20](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/forces/Force.ts#L20)

Interface para forças físicas (Strategy — GoF).
Qualquer força — gravitacional, eletromagnética, mola, vento, campo personalizado —
é uma função que recebe o estado atual do corpo e retorna um vetor de força.

## Example

```ts
// Gravidade padrão
world.addForce(new ConstantForce('gravity', vec3.fromValues(0, -9.81, 0)));

// Gravidade radial (espaço curvo)
world.addForce(new FunctionalForce('radial', (body) => {
    const pos = body.get<vec3>('position') ?? vec3.create();
    const dir = vec3.negate(vec3.create(), pos);
    return vec3.scale(dir, dir, 9.81 / Math.max(vec3.sqrLen(pos), 0.01));
}));
```

## Properties

### id

> `readonly` **id**: `string`

Defined in: [scene/systems/forces/Force.ts:21](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/forces/Force.ts#L21)

## Methods

### compute()

> **compute**(`body`, `dt`): `vec3`

Defined in: [scene/systems/forces/Force.ts:22](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/systems/forces/Force.ts#L22)

#### Parameters

##### body

[`PhysicsBody`](../classes/PhysicsBody.md)

##### dt

`number`

#### Returns

`vec3`
