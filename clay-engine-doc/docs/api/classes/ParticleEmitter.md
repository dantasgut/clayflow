# Abstract Class: ParticleEmitter

Defined in: [scene/components/particles/ParticleEmitter.ts:20](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L20)

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

Defined in: [scene/components/particles/ParticleEmitter.ts:37](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L37)

Partículas vivas neste frame — atualizado por `step()`.

***

### bindGroupIds

> **bindGroupIds**: `string`[] = `[]`

Defined in: [scene/components/particles/ParticleEmitter.ts:43](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L43)

Bind groups fornecidos ao render pass (inclui o buffer de partículas).

***

### bindGroupSchema

> **bindGroupSchema**: `GPUBindGroupLayoutEntry`[] = `[]`

Defined in: [scene/components/particles/ParticleEmitter.ts:46](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L46)

Schema do bind group de renderização (para registro no BindGroupManager).

***

### layer

> `readonly` **layer**: [`VISUAL_COMPONENT`](../enumerations/ResourceType.md#visual_component) = `ResourceType.VISUAL_COMPONENT`

Defined in: [scene/components/particles/ParticleEmitter.ts:24](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L24)

#### Implementation of

[`Component`](../interfaces/Component.md).[`layer`](../interfaces/Component.md#layer)

***

### maxParticles

> `abstract` `readonly` **maxParticles**: `number`

Defined in: [scene/components/particles/ParticleEmitter.ts:34](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L34)

Número máximo de partículas simultâneas alocadas no buffer GPU.

***

### shaderId

> **shaderId**: `string` = `'particle'`

Defined in: [scene/components/particles/ParticleEmitter.ts:40](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L40)

ID do shader pipeline para renderização das partículas.

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md) = `ResourceState.Uninitialized`

Defined in: [scene/components/particles/ParticleEmitter.ts:26](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L26)

#### Implementation of

[`Component`](../interfaces/Component.md).[`state`](../interfaces/Component.md#state)

***

### type

> `readonly` **type**: `"ParticleEmitter"` = `'ParticleEmitter'`

Defined in: [scene/components/particles/ParticleEmitter.ts:25](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L25)

#### Implementation of

[`Component`](../interfaces/Component.md).[`type`](../interfaces/Component.md#type)

***

### uuid

> `readonly` **uuid**: `string`

Defined in: [scene/components/particles/ParticleEmitter.ts:22](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L22)

#### Implementation of

[`Component`](../interfaces/Component.md).[`uuid`](../interfaces/Component.md#uuid)

## Methods

### allocateResource()

> **allocateResource**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:49](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L49)

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

Defined in: [scene/components/particles/ParticleEmitter.ts:60](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L60)

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

Defined in: [scene/components/particles/ParticleEmitter.ts:73](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L73)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

***

### doDispose()

> `abstract` `protected` **doDispose**(`rm`): `void`

Defined in: [scene/components/particles/ParticleEmitter.ts:75](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L75)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`void`

***

### doUpdate()

> `abstract` `protected` **doUpdate**(`rm`): `Promise`\<`void`\>

Defined in: [scene/components/particles/ParticleEmitter.ts:74](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L74)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

***

### get()

> **get**\<`T`\>(`key`): `T` \| `undefined`

Defined in: [scene/components/particles/ParticleEmitter.ts:31](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L31)

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

Defined in: [scene/components/particles/ParticleEmitter.ts:66](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L66)

#### Returns

`void`

***

### set()

> **set**\<`T`\>(`key`, `value`): `this`

Defined in: [scene/components/particles/ParticleEmitter.ts:30](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L30)

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

Defined in: [scene/components/particles/ParticleEmitter.ts:71](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L71)

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

Defined in: [scene/components/particles/ParticleEmitter.ts:55](https://github.com/dantasgut/clayflow/blob/62a74c18505ff2106bff29f570e2b2bd3265bf95/src/scene/components/particles/ParticleEmitter.ts#L55)

#### Parameters

##### rm

`ResourceManager`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`Component`](../interfaces/Component.md).[`updateResource`](../interfaces/Component.md#updateresource)
