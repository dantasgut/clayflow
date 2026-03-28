# Class: GPUParticleEmitter

Defined in: [elements/particles/GPUParticleEmitter.ts:74](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L74)

Emissor de partículas simulado na GPU via compute shader. (Camada 3)

Spawn: CPU grava novas partículas diretamente no storage buffer (ring buffer).
Update: compute shader integra todas as partículas vivas em paralelo.

Requer `GPUDevice` no construtor para criar o bind group de compute a partir
do layout inferido pelo pipeline (`layout: 'auto'`) — não modifica nenhuma
interface da camada 1.

## Example

```ts
const emitter = new GPUParticleEmitter(engine.compute, device, { maxParticles: 100_000 });
entity.add(emitter);
```

## Extends

- [`ParticleEmitter`](ParticleEmitter.md)

## Constructors

### Constructor

> **new GPUParticleEmitter**(`compute`, `device`, `options?`): `GPUParticleEmitter`

Defined in: [elements/particles/GPUParticleEmitter.ts:99](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L99)

#### Parameters

##### compute

`ComputeManager`

##### device

`GPUDevice`

##### options?

`GPUParticleEmitterOptions` = `{}`

#### Returns

`GPUParticleEmitter`

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`constructor`](ParticleEmitter.md#constructor)

## Properties

### aliveCount

> **aliveCount**: `number` = `0`

Defined in: [scene/components/particles/ParticleEmitter.ts:44](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L44)

Partículas vivas neste frame — atualizado por `step()`.

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`aliveCount`](ParticleEmitter.md#alivecount)

***

### bindGroupIds

> **bindGroupIds**: `string`[] = `[]`

Defined in: [scene/components/particles/ParticleEmitter.ts:50](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L50)

Bind groups fornecidos ao render pass (inclui o buffer de partículas).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`bindGroupIds`](ParticleEmitter.md#bindgroupids)

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/particles/ParticleEmitter.ts:53](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L53)

Schema do bind group de renderização (para registro no BindGroupManager).

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`bindGroupSchema`](ParticleEmitter.md#bindgroupschema)

***

### emissionRate

> **emissionRate**: `number`

Defined in: [elements/particles/GPUParticleEmitter.ts:76](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L76)

***

### gravity

> **gravity**: \[`number`, `number`, `number`\]

Defined in: [elements/particles/GPUParticleEmitter.ts:79](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L79)

***

### initialSpeed

> **initialSpeed**: `number`

Defined in: [elements/particles/GPUParticleEmitter.ts:78](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L78)

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/particles/ParticleEmitter.ts:26](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L26)

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`layer`](ParticleEmitter.md#layer)

***

### maxLife

> **maxLife**: `number`

Defined in: [elements/particles/GPUParticleEmitter.ts:77](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L77)

***

### maxParticles

> `readonly` **maxParticles**: `number`

Defined in: [elements/particles/GPUParticleEmitter.ts:75](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L75)

Número máximo de partículas simultâneas alocadas no buffer GPU.

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`maxParticles`](ParticleEmitter.md#maxparticles)

***

### shaderId

> **shaderId**: `string` = `'particle'`

Defined in: [scene/components/particles/ParticleEmitter.ts:47](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L47)

ID do shader pipeline para renderização das partículas.

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`shaderId`](ParticleEmitter.md#shaderid)

***

### shape

> **shape**: [`EmitterShape`](../interfaces/EmitterShape.md)

Defined in: [elements/particles/GPUParticleEmitter.ts:80](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L80)

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/particles/ParticleEmitter.ts:28](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L28)

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`state`](ParticleEmitter.md#state)

***

### type

> `readonly` **type**: `"ParticleEmitter"` = `'ParticleEmitter'`

Defined in: [scene/components/particles/ParticleEmitter.ts:27](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L27)

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`type`](ParticleEmitter.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/particles/ParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L24)

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`uuid`](ParticleEmitter.md#uuid)

## Accessors

### currentResourceState

#### Get Signature

> **get** **currentResourceState**(): `ResourceStateHandler`

Defined in: [scene/components/particles/ParticleEmitter.ts:31](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L31)

Handler do estado atual — encapsula capacidades do ciclo de vida GPU.

##### Returns

`ResourceStateHandler`

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`currentResourceState`](ParticleEmitter.md#currentresourcestate)

## Methods

### allocateResource()

> **allocateResource**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:56](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L56)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`allocateResource`](ParticleEmitter.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`rm`): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:67](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L67)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`void`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`disposeResource`](ParticleEmitter.md#disposeresource)

***

### doAllocate()

> `protected` **doAllocate**(`rm`): `Promise`\<`void`\>

Defined in: [elements/particles/GPUParticleEmitter.ts:120](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L120)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`doAllocate`](ParticleEmitter.md#doallocate)

***

### doDispose()

> `protected` **doDispose**(`rm`): `void`

Defined in: [elements/particles/GPUParticleEmitter.ts:160](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L160)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`void`

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`doDispose`](ParticleEmitter.md#dodispose)

***

### doUpdate()

> `protected` **doUpdate**(`_rm`): `Promise`\<`void`\>

Defined in: [elements/particles/GPUParticleEmitter.ts:158](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L158)

#### Parameters

##### \_rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`doUpdate`](ParticleEmitter.md#doupdate)

***

### get()

> **get**\<`T`\>(`key`): `T` \| `undefined`

Defined in: [scene/components/particles/ParticleEmitter.ts:38](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L38)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

#### Returns

`T` \| `undefined`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`get`](ParticleEmitter.md#get)

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:73](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L73)

#### Returns

`void`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`markDirty`](ParticleEmitter.md#markdirty)

***

### set()

> **set**\<`T`\>(`key`, `value`): `this`

Defined in: [scene/components/particles/ParticleEmitter.ts:37](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L37)

#### Type Parameters

##### T

`T`

#### Parameters

##### key

`string`

##### value

`T`

#### Returns

`this`

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`set`](ParticleEmitter.md#set)

***

### step()

> **step**(`encoder`, `dt`): `void`

Defined in: [elements/particles/GPUParticleEmitter.ts:168](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/elements/particles/GPUParticleEmitter.ts#L168)

Avança a simulação: spawn + integração. Chamado por ParticleSystem.step().

#### Parameters

##### encoder

`GPUCommandEncoder`

##### dt

`number`

#### Returns

`void`

#### Overrides

[`ParticleEmitter`](ParticleEmitter.md).[`step`](ParticleEmitter.md#step)

***

### updateResource()

> **updateResource**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:62](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L62)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`ParticleEmitter`](ParticleEmitter.md).[`updateResource`](ParticleEmitter.md#updateresource)
