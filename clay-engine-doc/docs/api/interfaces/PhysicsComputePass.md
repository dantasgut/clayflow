# Interface: PhysicsComputePass

Defined in: [scene/systems/PhysicsComputePass.ts:18](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsComputePass.ts#L18)

Contrato de um compute pass de física GPU (substitui `PhysicsStage`).

Diferenças em relação a `PhysicsStage`:
- Sem `beginFrame()` — warm starting e caches são internos ao pass.
- `dt` é sempre o dt do frame completo; substeps são internos ao pass.
- `ensureReady()` encapsula a compilação assíncrona de pipelines WGSL.
- `dispose()` libera todos os buffers GPU gerenciados pelo pass.

O `passId` corresponde ao algoritmo numérico, não ao tipo de corpo:
  'rb_xpbd' — XPBD para RigidBody
  'rb_lcp'  — LCP/PGS para RigidBody
  'sb_xpbd' — XPBD para SoftBody (partículas + constraints)

## Properties

### acceptedPhysicTypes

> `readonly` **acceptedPhysicTypes**: readonly `string`[]

Defined in: [scene/systems/PhysicsComputePass.ts:27](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsComputePass.ts#L27)

physicTypes que este pass aceita.
Ex: `['RigidBody']` para passes de corpo rígido.
Deve corresponder a `PhysicsBody.physicType` dos corpos a processar.

***

### passId

> `readonly` **passId**: `string`

Defined in: [scene/systems/PhysicsComputePass.ts:20](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsComputePass.ts#L20)

ID estável do algoritmo. Usado por GpuComputePassRegistry para associar corpos.

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [scene/systems/PhysicsComputePass.ts:45](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsComputePass.ts#L45)

Libera todos os buffers GPU gerenciados por este pass.
Chamado quando o pass é removido do registry ou a cena é desconectada.

#### Returns

`void`

***

### ensureReady()

> **ensureReady**(`core`): `Promise`\<`void`\>

Defined in: [scene/systems/PhysicsComputePass.ts:33](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsComputePass.ts#L33)

Garante que os pipelines WGSL estão compilados e prontos.
Idempotente — chamado antes do primeiro `execute()`.

#### Parameters

##### core

`EngineCore`

#### Returns

`Promise`\<`void`\>

***

### execute()

> **execute**(`context`, `dt`): `void`

Defined in: [scene/systems/PhysicsComputePass.ts:39](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/PhysicsComputePass.ts#L39)

Executa os dispatches deste pass para o frame atual.
Só chamado quando `ensureReady()` tiver resolvido com sucesso.

#### Parameters

##### context

[`GpuSimContext`](GpuSimContext.md)

##### dt

`number`

#### Returns

`void`
