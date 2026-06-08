---
sidebar_position: 10
title: Physics Flows
---

# Physics Flows

A Clay Engine roda **toda a física na GPU** via compute shaders. Não há fallback CPU. Cada categoria de simulação é um `Flow` que se auto-registra nos pools de bodies criados pelo `ResourceSystem`.

## Body como data class + Schema

Há apenas **três** classes de body — `RigidBody`, `SoftBody` e `FluidBody` — e todas são *data classes* puras: recebem um `StructSchema` no construtor e armazenam apenas `data` serializável. **É o schema que define o algoritmo**: a *pool key* é o `schema.name`, e cada `Flow` se registra para consumir uma pool key específica (`Flow.bodyType`).

```typescript
import { FluidBody } from 'webgpu-engine';
import { MPMFluidSchema } from 'webgpu-engine'; // schemas vêm de bodies/schemas/

// pos é vec4f; em muitos schemas pos.w codifica invMass (0 = body fixo)
const drop = new FluidBody({ schema: MPMFluidSchema, data: { pos: [0, 0.5, 0, 1] } });
```

Campos ausentes em `data` recebem default via `schema.applyDefaults`. Os nomes de campo de cada schema (ex.: `pos`, `vel`, `F_col0…`) estão na definição do schema — veja a [API Reference](/docs/api/) e os arquivos em `src/elements/physics/bodies/schemas/`.

## Mapa Body → Schema → Flow

| Body class   | Schema (pool key)    | Flow registrado | Algoritmo                        |
|--------------|----------------------|-----------------|----------------------------------|
| `RigidBody`  | `LCPSchema`          | `LCPFlow`       | LCP solver + position projection |
| `SoftBody`   | `XPBDSoftSchema`     | `XPBDFlow`      | Position-Based Dynamics (XPBD)   |
| `SoftBody`   | `FEMSchema`          | `FEMFlow`       | FEM tetraedral co-rotacional     |
| `SoftBody`   | `MPMSoftSchema`      | `MPMFlow`       | Material Point Method (soft)     |
| `FluidBody`  | `SPHSchema`          | `SPHFlow`       | WCSPH                            |
| `FluidBody`  | `PBFSchema`          | `PBFFlow`       | Position-Based Fluids            |
| `FluidBody`  | `MPMFluidSchema`     | `MPMFlow`       | Material Point Method (snow)     |
| `DistanceConstraint` | `DistanceConstraint` | *(consumido por `XPBDFlow.constraintPoolKey`)* | Constraint XPBD escalar |

> A pool key default de cada flow corresponde ao schema homônimo (ex.: `MPMFlow.bodyType` default `'MPMFluidSchema'`). Para coexistir duas pools do mesmo algoritmo (ex.: MPM soft e MPM fluido no mesmo frame), use schemas distintos.

## Receita: ragdoll com XPBD + DistanceConstraint

```typescript
import {
    Application, Camera, GravityField, SoftBody, DistanceConstraint, XPBDFlow,
} from 'webgpu-engine';
import { XPBDSoftSchema } from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.flows.register(new XPBDFlow(app.core, app.world, app.resources, {
    constraintPoolKey: 'DistanceConstraint',
    solverIters: 4,
}));

// 10 bodies em coluna. pos.w = invMass: o body 0 é fixo (invMass = 0).
const N = 10;
const REST = 0.2;
for (let i = 0; i < N; i++) {
    app.world.insert(new SoftBody({
        schema: XPBDSoftSchema,
        data: { pos: [0, 2 - i * REST, 0, i === 0 ? 0 : 1] },
    }));
}
// Constraints entre bodies consecutivos (índice = ordem de inserção no pool)
for (let i = 0; i < N - 1; i++) {
    app.world.insert(new DistanceConstraint({
        i, j: i + 1, rest_length: REST, compliance: 0,
    }));
}
app.start();
```

## Receita: snow material com MPM

```typescript
import { Application, FluidBody, MPMFlow, GravityField } from 'webgpu-engine';
import { MPMFluidSchema } from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.flows.register(new MPMFlow(app.core, app.world, app.resources, {
    gridDim: [32, 32, 32],
    cellSize: 0.1,
    gridOrigin: [-1.6, -1.6, -1.6],
}));

// Esfera de 200 partículas (FluidBody + MPMFluidSchema → pool roteia ao MPMFlow)
for (let i = 0; i < 200; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 0.3 * Math.cbrt(Math.random());
    app.world.insert(new FluidBody({
        schema: MPMFluidSchema,
        data: {
            pos: [
                r * Math.sin(phi) * Math.cos(theta),
                0.5 + r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta),
                1,
            ],
        },
    }));
}
app.start();
```

## Convenções dos Flows

- **Cada Flow é stateless quanto a entidades**: ao receber `frameTick`, lê pool count + buffer specs do `ResourceSystem`, monta bind groups idempotentes, e dispatcha.
- **Pool reallocation**: quando um pool dobra de capacidade, o ResourceSystem emite `poolReallocated`. Cada Flow override `onPoolReallocated(poolKey)` para invalidar bind groups que apontavam para o spec antigo.
- **Cleanup em remove**: cada Flow override `onEntitiesRemoved(ids)` para limpar caches indexados por `EntityId`.
- **Resize**: `onCanvasResized(w, h)` recria texturas de tamanho variável (ex.: depth buffer do `ForwardFlow`).

---

> **Veja também:** os pipelines internos de cada flow em
> [Pipeline XPBD](./pipeline_xpbd.md), [Pipeline LCP](./pipeline_lcp.md),
> [Pipeline FEM](./pipeline_fem.md) e [Pipeline MPM](./pipeline_mpm.md);
> a comparação de abordagens de soft body em [SoftBody](./SoftBody.md).
