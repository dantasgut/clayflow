---
sidebar_position: 10
title: Physics Flows
---

# Physics Flows

A Clay Engine roda **toda a física na GPU** via compute shaders. Não há fallback CPU. Cada categoria de simulação é um `Flow` registrado por factory com o `bodyType` do seu pool; a Camada 2 o instancia quando o primeiro body do tipo entra na cena (ver [Flows](./flows.md)).

## Criando bodies — vocabulário de domínio (recomendado)

Há **três** classes de body — `RigidBody`, `SoftBody` e `FluidBody`. A forma recomendada de criá-los é o
**construtor de domínio**: você fala em massa, atrito, forma e algoritmo — o motor deriva o layout do struct
GPU (`pos.w`, `mat_props`, `body_shape`, `I_inv`) internamente, anexa o colisor coerente, e o **Flow do algoritmo
entra em cena sozinho** ao inserir o body. Mesmo padrão de `StandardMaterial`/`BoxGeometry`.

```typescript
import { RigidBody, SoftBody, FluidBody } from 'webgpu-engine';

// Corpo rígido dinâmico (LCP) — colisor + Transform anexados automaticamente
const ball = new RigidBody({ shape: 'sphere', radius: 0.4, mass: 1, friction: 0.3, restitution: 0.45 });

// Partícula de soft body (XPBD) — pos.w recebe invMass derivado de mass
const node = new SoftBody({ algorithm: 'XPBD', position: [0, 2, 0], mass: 1 });

// Partícula de fluido (SPH/PBF/MPM)
const drop = new FluidBody({ algorithm: 'MPM', position: [0, 0.5, 0] });
```

Nenhum `schema`, `vec4` cru ou `flows.register` manual é necessário: os solvers padrão já estão registrados por
factory (`DEFAULT_SOLVER_REGISTRATIONS`, pelos defaults da `Application`) e, ao `world.insert(body)`, a C2 cria o
pool e instancia o Flow do algoritmo.

### Forma crua (avançado)

Para tuning de baixo nível, o construtor aceita `{ schema, data }` diretamente — controle total do struct,
sem derivações. Coexiste com a forma de domínio na mesma cena (produz o mesmo `Resource`):

```typescript
import { FluidBody, MPMFluidSchema } from 'webgpu-engine';
const drop = new FluidBody({ schema: MPMFluidSchema, data: { pos: [0, 0.5, 0, 0] } });
```

Os nomes de campo de cada schema (`pos`, `vel`, `F_col0…`) estão na definição do schema — veja a
[API Reference](/docs/api/README.md) e `src/elements/physics/bodies/schemas/`.

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
    Application, Camera, GravityField, SoftBody, DistanceConstraint, XPBDFlow, XPBDSoftSchema,
} from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new Camera({ aspect: canvas.width / canvas.height }));
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));

// Substitui o XPBDFlow padrão apenas para tunar solverIters/substeps (sem isto, o padrão
// é instanciado com defaults quando o primeiro SoftBody XPBD entra na cena).
app.flows.override(
    XPBDSoftSchema.name,
    (ctx) => new XPBDFlow(ctx, { constraintPoolKey: 'DistanceConstraint', solverIters: 4 }),
    { type: 'XPBDTuned', phase: 'physics' },
);

// 10 partículas em coluna. mass=0 ⇒ partícula fixa (invMass 0).
const N = 10;
const REST = 0.2;
for (let i = 0; i < N; i++) {
    app.world.insert(new SoftBody({
        algorithm: 'XPBD',
        position: [0, 2 - i * REST, 0],
        mass: i === 0 ? 0 : 1,
    }));
}
// Constraints entre partículas consecutivas (índice = ordem de inserção no pool)
for (let i = 0; i < N - 1; i++) {
    app.world.insert(new DistanceConstraint({
        i, j: i + 1, restLength: REST, compliance: 0,
    }));
}
app.start();
```

## Receita: snow material com MPM

```typescript
import { Application, FluidBody, GravityField, ParticleMaterial } from 'webgpu-engine';

const app = await Application.create({ canvas });
app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));

// A grade do MPM vem do material das partículas (slot opcional do MPMFlow): domínio e
// espaçamento definem origem, células por eixo e aresta da célula (2 × espaçamento).
app.world.insert(new ParticleMaterial({
    particleSpacing: 0.05,
    domainMin: [-1.6, -1.6, -1.6],
    domainMax: [1.6, 1.6, 1.6],
}));

// Esfera de 200 partículas (FluidBody 'MPM' → pool roteia ao MPMFlow)
for (let i = 0; i < 200; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = 0.3 * Math.cbrt(Math.random());
    app.world.insert(new FluidBody({
        algorithm: 'MPM',
        position: [
            r * Math.sin(phi) * Math.cos(theta),
            0.5 + r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta),
        ],
    }));
}
app.start();
```

## Convenções dos Flows

- **Slots, não consultas**: cada solver declara os seus slots (`slot.bodies()`, `slot.singleton(Time.schema)`, pools
  opcionais de restrições e colliders…); a C2 os resolve e entrega ao `dispatch(frame, bound)` — contagem, buffer e
  slot de cada entidade, sempre atuais.
- **Bind groups da C2**: layouts inferidos do WGSL e bind groups criados pela C2 (privados por nome + `consumes`).
  Quando um pool dobra de capacidade, a C2 recria os grupos afetados (`bindGroupReplaced`) antes da próxima gravação;
  o solver só religa os seus recursos privados que dependem do tamanho (numa transição, com `ctx.bind`).
- **Parâmetros fora da gravação**: uniforms por passo são escritos em `framePrepare`; o `dispatch` só grava.
- **Remoção**: a C2 libera os slots dos pools e entrega `slotChanged`/`poolReallocated` quando aplicável; leituras de
  volta à CPU (LCP) capturam o mapa slot → entidade no quadro em que a cópia foi gravada.
- **Substituição**: `app.flows.override(bodyType, factory, opções)` troca o solver de um tipo de corpo.

---

> **Veja também:** os pipelines internos de cada flow em
> [Pipeline XPBD](./pipeline_xpbd.md), [Pipeline LCP](./pipeline_lcp.md),
> [Pipeline FEM](./pipeline_fem.md) e [Pipeline MPM](./pipeline_mpm.md);
> a comparação de abordagens de soft body em [SoftBody](./SoftBody.md).
