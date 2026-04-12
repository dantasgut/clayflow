# Interface: GpuSimContext

Defined in: [scene/systems/GpuSimContext.ts:18](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/GpuSimContext.ts#L18)

Contexto de simulação GPU-only.

Substitui `PhysicsStageContext` — remove `candidatePairs` e `contacts`
(broadphase/narrowphase CPU eliminados). O narrowphase é inteiramente
gerenciado pelos compute shaders.

## Properties

### bodies

> `readonly` **bodies**: `ReadonlyMap`\<`string`, [`BodyEntry`](BodyEntry.md)\>

Defined in: [scene/systems/GpuSimContext.ts:19](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/GpuSimContext.ts#L19)

***

### colliderBufferRecreated

> **colliderBufferRecreated**: `boolean`

Defined in: [scene/systems/GpuSimContext.ts:25](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/GpuSimContext.ts#L25)

True se o buffer gpu_colliders_global foi recriado neste frame (invalida bind groups).

***

### colliderCount

> **colliderCount**: `number`

Defined in: [scene/systems/GpuSimContext.ts:23](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/GpuSimContext.ts#L23)

Número de colliders enviados ao buffer GPU neste frame (preenchido pelo orquestrador).

***

### colliders

> `readonly` **colliders**: `ReadonlyMap`\<`number`, [`ColliderReg`](ColliderReg.md)\>

Defined in: [scene/systems/GpuSimContext.ts:21](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/GpuSimContext.ts#L21)

***

### entityBodies

> `readonly` **entityBodies**: `ReadonlyMap`\<`number`, [`BodyEntry`](BodyEntry.md)\>

Defined in: [scene/systems/GpuSimContext.ts:20](https://github.com/dantasgut/clayflow/blob/02b1d356fbb46ac583261c11629af5fa6d9ef730/src/scene/systems/GpuSimContext.ts#L20)
