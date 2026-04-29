---
sidebar_position: 10
title: Physics Flows
---

# Physics Flows

A Clay Engine roda **toda a física na GPU** via compute shaders. Não há fallback CPU. Cada categoria de simulação é um `Flow` que se auto-registra nos pools de bodies criados pelo `ResourceSystem`.

## Mapa Body → Flow

| Body class                   | Schema WGSL          | Pool key             | Flow registrado    | Algoritmo                     |
|------------------------------|----------------------|----------------------|--------------------|-------------------------------|
| `RigidBody`                  | `RigidBody` (160B)   | `RigidBody:LCP`      | `LCPFlow`          | LCP solver + position projection |
| `SoftBody { algorithm: 'XPBD' }` | `Particle` (48B) | `SoftBody:XPBD`      | `XPBDFlow`         | Position-Based Dynamics       |
| `SoftBody { algorithm: 'FEM' }`  | `Particle` (48B) | `SoftBody:FEM`       | `FEMFlow`          | Tetrahedral co-rotational FEM |
| `MPMBody`                    | `MPMParticle` (128B) | `MPMParticle:MPM`    | `MPMFlow`          | Material Point Method (snow)  |
| `SPHBody`                    | `SPHParticle` (64B)  | `SPHParticle:SPH`    | `SPHFlow`          | WCSPH                         |
| `PBFBody`                    | `PBFParticle` (64B)  | `PBFParticle:PBF`    | `PBFFlow`          | Position-Based Fluids         |
| `DistanceConstraint`         | `DistanceConstraint` (16B) | `DistanceConstraint` | (consumido por XPBDFlow.constraintPoolKey) | Constraint XPBD scalar |

## Receita: ragdoll com XPBD + DistanceConstraint

```typescript
import {
    Application, Camera, GravityField, SoftBody, DistanceConstraint, XPBDFlow,
} from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.flows.register(new XPBDFlow(app.core, app.world, app.resources, {
    constraintPoolKey: 'DistanceConstraint',
    solverIters: 4,
}));

// 10 bodies em coluna; o body 0 é fixo (mass=0 → invMass=0).
const N = 10;
const REST = 0.2;
for (let i = 0; i < N; i++) {
    app.world.insert(new SoftBody({
        position: [0, 2 - i * REST, 0, 1],
        mass: i === 0 ? 0 : 1,
    }));
}
// Constraints entre bodies consecutivos (slot index = ordem de inserção)
for (let i = 0; i < N - 1; i++) {
    app.world.insert(new DistanceConstraint({
        i, j: i + 1, rest_length: REST, compliance: 0,
    }));
}
app.start();
```

## Receita: snow material com MPM

```typescript
import { MPMBody, MPMFlow, GravityField } from 'webgpu-engine';

app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.flows.register(new MPMFlow(app.core, app.world, app.resources, {
    gridDim: [32, 32, 32],
    cellSize: 0.1,
    gridOrigin: [-1.6, -1.6, -1.6],
}));

// Esfera de 200 partículas
for (let i = 0; i < 200; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 0.3 * Math.cbrt(Math.random());
    app.world.insert(new MPMBody({
        position: [
            r * Math.sin(phi) * Math.cos(theta),
            0.5 + r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta),
            1,
        ],
        mass: 0.01,
        volume: 1e-4,
    }));
}
app.start();
```

## Convenções dos Flows

- **Cada Flow é stateless quanto a entidades**: ao receber `frameTick`, lê pool count + buffer specs do `ResourceSystem`, monta bind groups idempotentes, e dispatcha.
- **Pool reallocation**: quando um pool dobra de capacidade, o ResourceSystem emite `poolReallocated`. Cada Flow override `onPoolReallocated(poolKey)` para invalidar bind groups que apontavam para o spec antigo.
- **Cleanup em remove**: cada Flow override `onEntitiesRemoved(ids)` para limpar caches indexados por `EntityId`.
- **Resize**: `onCanvasResized(w, h)` recria texturas de tamanho variável (ex.: depth buffer do `ForwardFlow`).
