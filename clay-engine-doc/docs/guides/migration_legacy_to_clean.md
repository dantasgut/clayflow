---
sidebar_position: 99
title: Migração — Legacy → Clean Architecture
---

# Migração da Engine Legacy para a Clean Architecture

A engine passou por uma reescrita em 4 camadas (`C1 Hardware`, `C2 Sync`,
`C3 Elements`, `C4 Presentation`). O código antigo segue intacto em
`src/legacy/` para compatibilidade durante a transição. Este guia mostra
os equivalentes 1:1 entre as APIs.

## TL;DR — substituições mais comuns

| Legacy | Clean |
|---|---|
| `import { ... } from 'webgpu-engine/legacy'` | `import { ... } from 'webgpu-engine'` |
| `createGpuPhysicsWorld(canvas)` | `await Application.create({ canvas })` |
| `physicsWorld.update(dt)` | `app.events.emit('frameTick', { dt, elapsed })` |
| `physicsWorld.bodies.push(rb)` | `app.world.insert(new RigidBody(...))` |
| `new SoftBody({ algorithm: 'XPBD' })` | `new SoftBody({}, { algorithm: 'XPBD' })` |
| `Physics.LCPSolver` | `new LCPFlow(app.core, app.world, app.resources)` registrado em `app.flows` |
| `mesh.material = mat` | `mesh.add(new StandardMaterial(...))` |
| `engineCore.commit()` | `app.start()` (GameLoop dispara via RAF) |

## Setup mínimo

**Antes (legacy):**

```typescript
import { createGpuPhysicsWorld } from 'webgpu-engine/legacy';
const world = await createGpuPhysicsWorld({ canvas });
world.start();
```

**Depois (clean):**

```typescript
import { Application } from 'webgpu-engine';
const app = await Application.create({ canvas });
app.start();
```

`Application.create` faz o bootstrap das 4 camadas:

- C1: `GpuEngineCore` adquire device/queue/canvas swapchain
- C2: `World`, `EventBus`, `ResourceSystem`, `ExecutionSystem`, `FlowRegistry` instanciam-se
- C4: `registerPresentationDefaults` registra `ShadowFlow + ForwardFlow + PostFlow + DebugFlow + UIFlow`

## Inserir entidades

**Antes:**

```typescript
const cube = new MeshBox(materials.standard, 1, 1, 1);
cube.position = [0, 0, 0];
world.add(cube);
```

**Depois:**

```typescript
import { BoxGeometry, StandardMaterial, Transform } from 'webgpu-engine';

const cube = new BoxGeometry({ size: [1, 1, 1] });
cube.add(new StandardMaterial({ albedo: [0.8, 0.4, 0.2, 1], roughness: 0.4 }));
cube.add(new Transform({ position: [0, 0, 0, 1] }));
app.world.insert(cube);
```

A composição via `entity.add(part)` faz o `World.insert` indexar o root e
todos os filhos no mesmo `EntityId`, e o `ResourceSystem` aloca buffers/binds
automaticamente conforme cada `Resource.getDescriptors()`.

## Física

**Antes:**

```typescript
world.physics.gravity = [0, -9.81, 0];
world.physics.addRigidBody({ position: [0, 5, 0], mass: 1, restitution: 0.3 });
```

**Depois:**

```typescript
import { GravityField, RigidBody, LCPFlow } from 'webgpu-engine';

app.world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
app.world.insert(new RigidBody({ position: [0, 5, 0, 1], mass: 1, restitution: 0.3 }));
app.flows.register(new LCPFlow(app.core, app.world, app.resources));
```

Cada solver (LCP, XPBD, FEM, MPM, SPH, PBF) é um `Flow` que se auto-registra
nos pools de bodies por algoritmo (`SoftBody:XPBD`, `MPMParticle:MPM`, etc.).

## Controllers

**Antes:** orbit/fps/fly hardcoded no engine.
**Depois:** opt-in via `InteractionSystem.addController`:

```typescript
import { InteractionSystem, OrbitController } from 'webgpu-engine';

const interaction = new InteractionSystem({ canvas, window }, app.events);
interaction.attach();
interaction.addController(new OrbitController(camera, {
    target: [0, 0, 0], distance: 5,
    autoRotate: true, damping: 0.85,
}));
```

## Pós-processamento

**Antes:** chain hardcoded no render pipeline.
**Depois:** `app.defaults.post.addEffect(...)`:

```typescript
import { Bloom, ToneMapping, Fxaa, Vignette } from 'webgpu-engine';

app.defaults.post.addEffect(new ToneMapping());
app.defaults.post.addEffect(new Bloom({ aux: [0.5, 0, 0] }));
app.defaults.post.addEffect(new Fxaa());
app.defaults.post.addEffect(new Vignette());
```

A ordem importa — efeitos são aplicados em cadeia ping-pong sobre o offscreen
do `ForwardFlow` antes de blittar para o canvas.

## Loaders

**Antes:** `loadMesh`, `loadTexture` síncronos sintéticos.
**Depois:** `Assets` consolidado em `presentation/assets/`:

```typescript
import { GltfLoader, TextureLoader, FontLoader } from 'webgpu-engine';

const gltf = await new GltfLoader().load('/assets/model.glb');
const tex = await new TextureLoader().load('/assets/diffuse.png');
const font = await new FontLoader().load('Inter', '/fonts/Inter.woff2', { fontSize: 32 });
```

GLB binário é detectado por magic — basta passar a URL ou `parse(arrayBuffer, url)`.

## Convivência durante a transição

`webgpu-engine/legacy` continua exportado e funcional, apontando para
`src/legacy/`. Após você migrar todos os call sites para a API limpa, remova
o import de `legacy` e nenhum bytecode legacy entrará no bundle (tree-shaken).

A migração é **opcional**: legacy permanecerá enquanto houver consumidores.
A motivação para migrar é acessar features novas (Flow XPBD com
DistanceConstraint, MPMFlow snow material, post-effects modulares,
GltfLoader com skinning, profiler timestamp-query, controllers com damping).
