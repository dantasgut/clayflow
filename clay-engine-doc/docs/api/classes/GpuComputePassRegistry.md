# Class: GpuComputePassRegistry

Defined in: [scene/systems/gpu/GpuComputePassRegistry.ts:20](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuComputePassRegistry.ts#L20)

Registry de `PhysicsComputePass` ativos na cena.

Responsabilidades:
- Registrar/remover passes.
- Garantir que cada pass está pronto (`ensureReady()`) antes do primeiro `execute()`.
- Delegar `execute()` para cada pass ativo na ordem de registro.
- Delegar `dispose()` quando a cena é desconectada.

A seleção de quais passes executam sobre quais corpos é feita internamente
por cada pass via `acceptedPhysicTypes` — o registry não filtra.

Não requer EngineCore no construtor — usa o singleton WebGPUEngineCore lazily
em executeAll(), que só é chamado após initialize().

## Constructors

### Constructor

> **new GpuComputePassRegistry**(): `GpuComputePassRegistry`

#### Returns

`GpuComputePassRegistry`

## Accessors

### activePasses

#### Get Signature

> **get** **activePasses**(): readonly [`PhysicsComputePass`](../interfaces/PhysicsComputePass.md)[]

Defined in: [scene/systems/gpu/GpuComputePassRegistry.ts:69](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuComputePassRegistry.ts#L69)

Retorna os passes registrados (somente leitura).

##### Returns

readonly [`PhysicsComputePass`](../interfaces/PhysicsComputePass.md)[]

## Methods

### disposeAll()

> **disposeAll**(): `void`

Defined in: [scene/systems/gpu/GpuComputePassRegistry.ts:60](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuComputePassRegistry.ts#L60)

Libera todos os passes registrados. Chamado ao desconectar a cena.

#### Returns

`void`

***

### executeAll()

> **executeAll**(`context`, `dt`): `Promise`\<`void`\>

Defined in: [scene/systems/gpu/GpuComputePassRegistry.ts:43](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuComputePassRegistry.ts#L43)

Garante que todos os passes estão prontos e executa cada um.
Passes ainda em inicialização são silenciosamente ignorados neste frame.

#### Parameters

##### context

[`GpuSimContext`](../interfaces/GpuSimContext.md)

##### dt

`number`

#### Returns

`Promise`\<`void`\>

***

### register()

> **register**(`pass`): `void`

Defined in: [scene/systems/gpu/GpuComputePassRegistry.ts:26](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuComputePassRegistry.ts#L26)

Registra um pass. Passes são executados na ordem de registro.

#### Parameters

##### pass

[`PhysicsComputePass`](../interfaces/PhysicsComputePass.md)

#### Returns

`void`

***

### unregister()

> **unregister**(`passId`): `void`

Defined in: [scene/systems/gpu/GpuComputePassRegistry.ts:31](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuComputePassRegistry.ts#L31)

Remove e descarta um pass pelo seu `passId`.

#### Parameters

##### passId

`string`

#### Returns

`void`
