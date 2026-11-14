[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [elements](../README.md) / Entity

# Abstract Class: Entity\<TData\>

Defined in: [src/scene/contracts/Entity.ts:64](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L64)

Entity é a unidade composicional da Camada 2 (Sync) — qualquer objeto
inserido em `World` herda de Entity. A composição é via `add(child)`:
uma Entity-pai agrega Entity-filhas em uma árvore plana, e
`World.insert(root)` percorre a árvore registrando cada filho como
`Resource` indexável.

Padrão de uso típico:
```ts
const box = new BoxGeometry({ size: [1, 1, 1] });
box.add(new StandardMaterial({ albedo: [0.7, 0.3, 0.2, 1] }));
box.add(new Transform({ position: [0, 0, 0, 1] }));
world.insert(box);  // registra geometria + material + transform
```

Subclasses concretas (Camera, Transform, BoxGeometry, etc.) implementam
`Resource` (descritores GPU), enquanto Entity provê a hierarquia e o `data`
do Resource: um acessor no protótipo, tipado pelo parâmetro `TData`
(`class Camera extends Entity<CameraData>`). Subclasses atribuem `this.data = …`
no construtor e não declaram o campo `data` — um campo próprio na instância
esconderia o acessor e as mutações não marcariam o envio. Na cena, a C2 liga o
acessor ao proxy reativo (mutação de campo e reatribuição inteira marcam o
recurso) sem redefinir propriedades na instância: o objeto mantém a forma da
classe (um milhão de entidades sem objetos em modo dicionário).
Entity é abstrata — não pode ser instanciada diretamente.

## Extended by

- [`PostProcessEffect`](../../presentation/classes/PostProcessEffect.md)
- [`ToneMapping`](../../presentation/classes/ToneMapping.md)
- [`Time`](../../presentation/classes/Time.md)
- [`Input`](../../presentation/classes/Input.md)
- [`InputDrivenController`](../../presentation/classes/InputDrivenController.md)
- [`ParticlePhysics`](ParticlePhysics.md)
- [`Renderer`](Renderer.md)
- [`Scene`](Scene.md)
- [`Transform`](Transform.md)
- [`Camera`](Camera.md)
- [`Parent`](Parent.md)
- [`Light`](Light.md)
- [`HemisphereLight`](HemisphereLight.md)
- [`EnvironmentMap`](EnvironmentMap.md)
- [`ShadowMap`](ShadowMap.md)
- [`TemporalAntialiasing`](TemporalAntialiasing.md)
- [`CanvasRenderTarget`](CanvasRenderTarget.md)
- [`OffscreenRenderTarget`](OffscreenRenderTarget.md)
- [`Sky`](Sky.md)
- [`RayScene`](RayScene.md)
- [`GlobalIllumination`](GlobalIllumination.md)
- [`TemporalFilter`](TemporalFilter.md)
- [`FluidField`](FluidField.md)
- [`FogVolume`](FogVolume.md)
- [`Froxels`](Froxels.md)
- [`Geometry`](Geometry.md)
- [`Material`](Material.md)
- [`PbrTables`](PbrTables.md)
- [`PhysicsBody`](PhysicsBody.md)
- [`ForceField`](ForceField.md)
- [`Collider`](Collider.md)
- [`Constraint`](Constraint.md)
- [`SurfacePhysics`](SurfacePhysics.md)
- [`Atmosphere`](Atmosphere.md)
- [`EnergyMeter`](EnergyMeter.md)
- [`ParticleEmitter`](ParticleEmitter.md)
- [`DiffuseParticles`](DiffuseParticles.md)
- [`NeighborSearchGrid`](NeighborSearchGrid.md)
- [`EulerianGrid`](EulerianGrid.md)
- [`FlowWork`](../../platform/web/classes/FlowWork.md)
- [`ExtensionFunction`](../../platform/web/classes/ExtensionFunction.md)
- [`SetGraph`](../../platform/web/classes/SetGraph.md)

## Type Parameters

### TData

`TData` *extends* `object` = `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new Entity**\<`TData`\>(): `Entity`\<`TData`\>

#### Returns

`Entity`\<`TData`\>

## Accessors

### attached

#### Get Signature

> **get** **attached**(): readonly `Entity`\<`object`\>[]

Defined in: [src/scene/contracts/Entity.ts:160](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L160)

Lista somente-leitura dos filhos diretos. World.insert traverse essa
árvore recursivamente para coletar todos os Resources de um root.

##### Returns

readonly `Entity`\<`object`\>[]

***

### data

#### Get Signature

> **get** **data**(): `TData`

Defined in: [src/scene/contracts/Entity.ts:97](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L97)

Dados do Resource (o layout é o do schema dos descritores). Na cena, mutações de campo (`data.position = …`,
`data.position[0] = …`) e a reatribuição inteira (`data = …`) marcam o recurso para envio.

##### Returns

`TData`

#### Set Signature

> **set** **data**(`next`): `void`

Defined in: [src/scene/contracts/Entity.ts:103](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L103)

Troca o dado inteiro; na cena, o recurso inteiro é marcado para envio.

##### Parameters

###### next

`TData`

##### Returns

`void`

***

### rawData

#### Get Signature

> **get** `protected` **rawData**(): `Readonly`\<`TData`\>

Defined in: [src/scene/contracts/Entity.ts:117](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L117)

O dado cru, sem o proxy reativo — para leituras do próprio Resource (ex.: uma propriedade derivada consultada pelos
estágios) que não devem criar proxies aninhados. Escrever por aqui não marca o recurso.

##### Returns

`Readonly`\<`TData`\>

## Methods

### add()

> **add**(`e`): `this`

Defined in: [src/scene/contracts/Entity.ts:140](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L140)

Anexa uma Entity-filha. Retorna `this` para chaining fluente.
Não valida ciclos nem múltiplos pais — responsabilidade do caller.

#### Parameters

##### e

`Entity`\<`object`\>

#### Returns

`this`

***

### detach()

> **detach**(`e`): `boolean`

Defined in: [src/scene/contracts/Entity.ts:149](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L149)

Desanexa uma Entity-filha direta (inverso de `add`). Devolve `false` se ela não é filha desta. Numa entidade já
inserida, use `World.detach` (que também atualiza a cena).

#### Parameters

##### e

`Entity`\<`object`\>

#### Returns

`boolean`

***

### redescribe()

> `protected` **redescribe**(`previous`, `next`): `void`

Defined in: [src/scene/contracts/Entity.ts:127](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/scene/contracts/Entity.ts#L127)

Troca o dado e os descritores em pool de uma vez — o Resource cujo layout depende do próprio dado (ex.: o registro
tipado de uma função de ponto quando a forma dos parâmetros muda; spec 031, R8). `getDescriptors()` já devolve os
novos; `previous` são os de antes. Fora da cena, só troca o dado; na cena, a C2 libera os slots nos pools antigos,
ocupa os dos novos com `next` e recompõe a entidade (`entitiesRecomposed`: registros e conjuntos dos estágios).

#### Parameters

##### previous

readonly [`GPUDescriptor`](../../platform/web/interfaces/GPUDescriptor.md)[]

##### next

`TData`

#### Returns

`void`
