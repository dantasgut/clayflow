# Interface: GpuPipelineEventBus

Defined in: [scene/systems/gpu/GpuPipelineEventBus.ts:55](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuPipelineEventBus.ts#L55)

Barramento de eventos tipado para coordenação de stages do pipeline GPU.
Camada 2 — sem dependência de WebGPU.

Eventos nomeados por domínio de stage JS (physics:*), nunca por shader (rb_*).
Handlers são síncronos — sem microtasks adicionais no caminho crítico do frame.

## Methods

### emit()

> **emit**\<`K`\>(`type`, `payload`): `void`

Defined in: [scene/systems/gpu/GpuPipelineEventBus.ts:66](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuPipelineEventBus.ts#L66)

#### Type Parameters

##### K

`K` *extends* keyof `GpuPipelineEventMap`

#### Parameters

##### type

`K`

##### payload

`GpuPipelineEventMap`\[`K`\]

#### Returns

`void`

***

### off()

> **off**\<`K`\>(`type`, `handler`): `void`

Defined in: [scene/systems/gpu/GpuPipelineEventBus.ts:61](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuPipelineEventBus.ts#L61)

#### Type Parameters

##### K

`K` *extends* keyof `GpuPipelineEventMap`

#### Parameters

##### type

`K`

##### handler

(`payload`) => `void`

#### Returns

`void`

***

### on()

> **on**\<`K`\>(`type`, `handler`): () => `void`

Defined in: [scene/systems/gpu/GpuPipelineEventBus.ts:56](https://github.com/dantasgut/clayflow/blob/7f07eedac2c1cf94d44b78ad841d845219723bba/src/scene/systems/gpu/GpuPipelineEventBus.ts#L56)

#### Type Parameters

##### K

`K` *extends* keyof `GpuPipelineEventMap`

#### Parameters

##### type

`K`

##### handler

(`payload`) => `void`

#### Returns

() => `void`
