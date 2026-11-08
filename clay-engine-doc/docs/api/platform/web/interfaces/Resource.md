[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/web](../README.md) / Resource

# Interface: Resource

Defined in: [src/scene/contracts/Resource.ts:23](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L23)

Resource é o contrato implementado por todo objeto da Camada 3 (Elements)
que vira buffer/textura/bindgroup na GPU. Camera, Transform, Material,
Geometry, RigidBody, etc. são Resources concretos.

Ciclo de vida (gerenciado pelo `ResourceSystem`):
  1. **Uninitialized** após construção.
  2. **Loading** quando World.insert detecta o resource — ResourceSystem
     lê `getDescriptors()` e aloca buffers/bindgroups via core.
  3. **Ready** após upload inicial.
  4. **Dirty** quando `data` muda — ResourceSystem re-uploada.
  5. **Disposed** → **Destroyed** ao remover do World.

`data` é o storage runtime — mutável pelo app sem lock; State pattern
garante consistência reativa via `resourceDirty` event.

## Properties

### contentKey?

> `readonly` `optional` **contentKey?**: `string`

Defined in: [src/scene/contracts/Resource.ts:55](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L55)

Chave de conteúdo dos descritores `vertex`/`index` (spec 007). Resources com a mesma chave compartilham esses
buffers na GPU: a Camada 2 cria e escreve o buffer uma vez por chave e o libera quando o último usuário sai. Sem
chave, cada Resource tem os seus.

***

### data

> **data**: `object`

Defined in: [src/scene/contracts/Resource.ts:33](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L33)

Dados runtime do resource (e.g. Camera position, Material albedo,
RigidBody mass). Schema é declarado em `getDescriptors()[i].schema`.
Mutações devem disparar evento `resourceDirty` para re-upload. O tipo
concreto vem do parâmetro de `Entity<TData>`; o motor lê os campos pelo
schema.

***

### state

> **state**: [`ResourceState`](../enumerations/ResourceState.md)

Defined in: [src/scene/contracts/Resource.ts:25](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L25)

Estado atual do lifecycle (gerenciado por ResourceSystem).

## Methods

### getDescriptors()

> **getDescriptors**(): readonly [`GPUDescriptor`](GPUDescriptor.md)[]

Defined in: [src/scene/contracts/Resource.ts:41](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L41)

Lista de bindings GPU (uniform/storage buffers, texturas, samplers)
que este resource expõe ao `ResourceSystem`. Cada descriptor define
`id`, `role`, `schema` (StructSchema) e opcionalmente `storage`
(`'pool'` para coalescer N members do mesmo schema em 1 buffer).

#### Returns

readonly [`GPUDescriptor`](GPUDescriptor.md)[]

***

### getFlowDescriptors()?

> `optional` **getFlowDescriptors**(): readonly [`FlowDescriptor`](FlowDescriptor.md)[]

Defined in: [src/scene/contracts/Resource.ts:63](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L63)

Flows associados ao resource. Opcional — usado por Resources que
preferem encapsular sua lógica de execução (e.g. SoftBody declarando
seu próprio XPBDFlow). Quando ausente, o app/plugin registra flows
separadamente.

#### Returns

readonly [`FlowDescriptor`](FlowDescriptor.md)[]

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly [`PipelineDescriptor`](PipelineDescriptor.md)[]

Defined in: [src/scene/contracts/Resource.ts:48](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L48)

Pipelines GPU declaradas pelo resource (shader e entry points; recursos
pelos módulos declarados). Útil para Materials que carregam shaders próprios.
Vazio para a maioria (Flows criam pipelines diretamente).

#### Returns

readonly [`PipelineDescriptor`](PipelineDescriptor.md)[]

***

### getSceneContributions()?

> `optional` **getSceneContributions**(): readonly `SceneContribution`[]

Defined in: [src/scene/contracts/Resource.ts:70](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Resource.ts#L70)

Contribuições do Resource para pontos de cena (spec 031, R4): ex. a sombra para `light_visibility`, a água para
`light_transmission`. A C2 compõe as contribuições presentes e troca o pronto de cada ponto em todo pipeline que
o contém; os estágios não conhecem os contribuintes.

#### Returns

readonly `SceneContribution`[]
