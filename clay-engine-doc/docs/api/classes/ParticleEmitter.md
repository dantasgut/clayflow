# Abstract Class: ParticleEmitter

Defined in: [scene/components/particles/ParticleEmitter.ts:22](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L22)

Componente abstrato de emissor de partículas. (Camada 2)

Template Method selado: subclasses implementam `doAllocate`, `doUpdate`, `doDispose` e `step`.
Property Bag herdado: configurações arbitrárias legíveis por estratégias externas.

Renderização via instanced draw — o vertex shader usa `@builtin(instance_index)`
para ler posição/vida diretamente do buffer de partículas (storage buffer).
Não usa Geometry convencional.

## Example

```ts
const emitter = new CPUParticleEmitter({ maxParticles: 500 });
entity.add(emitter);
```

## Extended by

- [`CPUParticleEmitter`](CPUParticleEmitter.md)
- [`GPUParticleEmitter`](GPUParticleEmitter.md)

## Implements

- [`Component`](../interfaces/Component.md)

## Constructors

### Constructor

> **new ParticleEmitter**(): `ParticleEmitter`

#### Returns

`ParticleEmitter`

## Properties

### aliveCount

> **aliveCount**: `number` = `0`

Defined in: [scene/components/particles/ParticleEmitter.ts:44](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L44)

Partículas vivas neste frame — atualizado por `step()`.

***

### bindGroupIds

> **bindGroupIds**: `string`[] = `[]`

Defined in: [scene/components/particles/ParticleEmitter.ts:50](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L50)

Bind groups fornecidos ao render pass (inclui o buffer de partículas).

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/particles/ParticleEmitter.ts:53](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L53)

Schema do bind group de renderização (para registro no BindGroupManager).

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/particles/ParticleEmitter.ts:26](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L26)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### maxParticles

> `abstract` `readonly` **maxParticles**: `number`

Defined in: [scene/components/particles/ParticleEmitter.ts:41](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L41)

Número máximo de partículas simultâneas alocadas no buffer GPU.

***

### shaderId

> **shaderId**: `string` = `'particle'`

Defined in: [scene/components/particles/ParticleEmitter.ts:47](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L47)

ID do shader pipeline para renderização das partículas.

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/particles/ParticleEmitter.ts:28](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L28)

#### Implementation of

[`Component`](../interfaces/Component.md).[`state`](../interfaces/Component.md#state)

***

### type

> `readonly` **type**: `"ParticleEmitter"` = `'ParticleEmitter'`

Defined in: [scene/components/particles/ParticleEmitter.ts:27](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L27)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/particles/ParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L24)

#### Implementation of

[`Component`](../interfaces/Component.md).[`uuid`](../interfaces/Component.md#uuid)

## Accessors

### currentResourceState

#### Get Signature

> **get** **currentResourceState**(): `ResourceStateHandler`

Defined in: [scene/components/particles/ParticleEmitter.ts:31](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L31)

Handler do estado atual — encapsula capacidades do ciclo de vida GPU.

##### Returns

`ResourceStateHandler`

Handler do estado atual — consulta de capacidades pelos consumidores.

#### Implementation of

[`Component`](../interfaces/Component.md).[`currentResourceState`](../interfaces/Component.md#currentresourcestate)

## Methods

### allocateResource()

> **allocateResource**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:56](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L56)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Component`](../interfaces/Component.md).[`allocateResource`](../interfaces/Component.md#allocateresource)

***

### disposeResource()

> **disposeResource**(`rm`): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:67](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L67)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`void`

#### Implementation of

[`Component`](../interfaces/Component.md).[`disposeResource`](../interfaces/Component.md#disposeresource)

***

### doAllocate()

> `abstract` `protected` **doAllocate**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:81](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L81)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

***

### doDispose()

> `abstract` `protected` **doDispose**(`rm`): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:83](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L83)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`void`

***

### doUpdate()

> `abstract` `protected` **doUpdate**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:82](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L82)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

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

***

### markDirty()

> **markDirty**(): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:73](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L73)

#### Returns

`void`

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

***

### step()

> `abstract` **step**(`encoder`, `dt`): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:79](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L79)

Avança a simulação: spawn + integração. Chamado por ParticleSystem.step().

#### Parameters

##### encoder

`GPUCommandEncoder`

##### dt

`number`

#### Returns

`void`

***

### updateResource()

> **updateResource**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:62](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/components/particles/ParticleEmitter.ts#L62)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Component`](../interfaces/Component.md).[`updateResource`](../interfaces/Component.md#updateresource)
