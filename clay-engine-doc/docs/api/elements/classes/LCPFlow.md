[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [elements](../README.md) / LCPFlow

# Class: LCPFlow

Defined in: [elements/physics/flows/LCPFlow.ts:96](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L96)

LCPFlow — solver de RigidBody via LCP (Linear Complementarity Problem) com
4 fases canônicas conforme arquitetura revisada: DetectContacts → AssembleA →
SolvePGS×K → Apply. O quadro executa `time.steps` passos de `time.stepDt` (o `Time` da cena, consultado
no World); cada passo faz predict, `substeps` iterações de detecção + solve e commit, cada iteração com a
sua região de parâmetros (`PerStepUniforms`, offset dinâmico — research A1). Etapas:

  1. `rb_predict`        — integra gravidade + damping em `pos_pred`/`rot_pred`/`vel`
  2. narrowphase × N     — uma variante por pool de Collider (Plane/Box/Sphere/Mesh)
  3. `rb_build_lcp`      — preenche bias `b_vec` + diagonais Delassus por contato (massas divididas)
  4. `rb_solve_lcp`      — warm start + K iterações Jacobi com divisão de massa, paralelas por contato e por
                           corpo (research R19)
  5. `rb_contact_accumulate` + `rb_lcp_commit` — correção posicional por corpo; velocidades e pose

Ao fim do frame, faz CPU readback do pool de bodies e publica a pose (posição e
rotação) no `Transform` de cada entidade; a mutação reativa leva a pose à GPU no
quadro seguinte e o `TransformFlow` produz a matriz de mundo. A escala do `Transform`
é do desenvolvedor e não é tocada. (O readback some na F2, quando a física escrever a
pose direto na GPU.)

## Extends

- `Flow`

## Constructors

### Constructor

> **new LCPFlow**(`core`, `world`, `resources`, `options?`): `LCPFlow`

Defined in: [elements/physics/flows/LCPFlow.ts:154](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L154)

#### Parameters

##### core

`EngineCore`

##### world

`World`

##### resources

`ResourceSystem`

##### options?

[`LCPFlowOptions`](../interfaces/LCPFlowOptions.md) = `{}`

#### Returns

`LCPFlow`

#### Overrides

`Flow.constructor`

## Properties

### bodyType

> `readonly` **bodyType**: `"LCPSchema"` = `'LCPSchema'`

Defined in: [elements/physics/flows/LCPFlow.ts:98](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L98)

Tipo de Resource consumido como "corpo" deste flow (e.g. 'LCPSchema'
para LCPFlow) — coincide com o `schema.name` do pool atendido. Vazio
quando o flow não é body-bound. Usado por FlowRegistry.resolve(bodyType)
para encontrar o flow responsável por cada Resource.

#### Overrides

`Flow.bodyType`

***

### phase

> `readonly` **phase**: `Phase` = `'physics'`

Defined in: [elements/physics/flows/LCPFlow.ts:99](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L99)

Fase do pipeline em que o flow executa.

#### Overrides

`Flow.phase`

***

### priority

> **priority**: `number` = `10`

Defined in: [elements/physics/flows/LCPFlow.ts:100](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L100)

Prioridade dentro da phase. Maior valor = roda primeiro. Default 0.
Útil quando dois flows compartilham phase mas têm dependência de ordem
(e.g. um flow gera dado que outro consome).

#### Overrides

`Flow.priority`

***

### type

> `readonly` **type**: `"LCPFlow"` = `'LCPFlow'`

Defined in: [elements/physics/flows/LCPFlow.ts:97](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L97)

Identificador legível (e.g. 'ForwardFlow'). Usado em logs e debug.

#### Overrides

`Flow.type`

## Methods

### applyTransformsFromReadback()

> `protected` **applyTransformsFromReadback**(`ab`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:910](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L910)

Publica a pose lida da GPU no `Transform` de cada corpo: só posição e rotação
(normalizada; nula ⇒ identidade). A escala não é tocada.

#### Parameters

##### ab

`ArrayBuffer`

#### Returns

`void`

***

### contactCapacity()

> **contactCapacity**(`bodyCount`, `totalCol`): `number`

Defined in: [elements/physics/flows/LCPFlow.ts:313](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L313)

Capacidade da lista compactada de contatos (research R19): no máximo 8 contatos por par (cantos), `maxContactsPerBody`
por corpo e o que cabe num binding de storage do device.

#### Parameters

##### bodyCount

`number`

##### totalCol

`number`

#### Returns

`number`

***

### dispatch()

> **dispatch**(`frame`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:652](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L652)

Hot path: chamado uma vez por frame quando o flow está ready. O `frame`
contém o command encoder ativo — use `frame.compute(...)` ou
`frame.render(target, ...)` para emitir comandos GPU.

#### Parameters

##### frame

`Frame`

#### Returns

`void`

#### Overrides

`Flow.dispatch`

***

### dispose()

> **dispose**(): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:227](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L227)

Descarte do estágio: libera kernels, parâmetros, contatos, staging e buffers auxiliares.

#### Returns

`void`

#### Overrides

`Flow.dispose`

***

### getPipelineDescriptors()

> **getPipelineDescriptors**(): readonly `PipelineDescriptor`[]

Defined in: [elements/physics/flows/LCPFlow.ts:178](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L178)

Retorna os descritores de pipelines GPU que este flow precisa criar
(para introspeção arquitetural / debugging — o flow ainda materializa
via core.create internamente).

#### Returns

readonly `PipelineDescriptor`[]

#### Overrides

`Flow.getPipelineDescriptors`

***

### isReady()

> **isReady**(): `boolean`

Defined in: [elements/physics/flows/LCPFlow.ts:254](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L254)

Indica se o flow tem trabalho válido para esta frame. Default: true
(sempre dispatch). Override para gating em prerequisites: e.g. presença
de Camera no World, pool não-vazio, pipeline async ainda compilando.
ExecutionSystem skipa flows com `isReady() === false`.

#### Returns

`boolean`

#### Overrides

`Flow.isReady`

***

### onCanvasResized()

> **onCanvasResized**(`_width`, `_height`): `void`

Defined in: [scene/flows/Flow.ts:114](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/scene/flows/Flow.ts#L114)

Chamado quando o canvas é redimensionado. Subclasses que mantêm
textures de tamanho-de-canvas (depth, color offscreen, ping-pong)
devem destruir e nullificar para recriarem na próxima dispatch.
Importante: destruir bindgroups que referenciam essas textures ANTES
para evitar use-after-free na GPU.

#### Parameters

##### \_width

`number`

##### \_height

`number`

#### Returns

`void`

#### Inherited from

`Flow.onCanvasResized`

***

### onEntitiesInserted()

> **onEntitiesInserted**(`_ids`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:271](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L271)

Chamado quando entidades são inseridas no World (depois da alocação dos seus recursos). Estágios que mantêm
um conjunto de entidades de interesse (ex.: renderizáveis) o atualizam aqui, em vez de consultar o World a
cada quadro.

#### Parameters

##### \_ids

readonly `number`[]

#### Returns

`void`

#### Overrides

`Flow.onEntitiesInserted`

***

### onEntitiesRemoved()

> **onEntitiesRemoved**(`_ids`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:276](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L276)

Chamado quando entidades são removidas do World. Subclasses que
cacheiam slots por EntityId devem limpar os entries afetados para
evitar leaks de slots órfãos.

#### Parameters

##### \_ids

readonly `number`[]

#### Returns

`void`

#### Overrides

`Flow.onEntitiesRemoved`

***

### onEvent()

> **onEvent**(`_event`, `_payload`): `void`

Defined in: [scene/flows/Flow.ts:66](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/scene/flows/Flow.ts#L66)

Hook genérico de eventos. Default no-op. A maioria dos flows usa os
hooks específicos abaixo (`onPoolReallocated`, etc.) ao invés deste.

#### Parameters

##### \_event

`string`

##### \_payload

`unknown`

#### Returns

`void`

#### Inherited from

`Flow.onEvent`

***

### onPoolReallocated()

> **onPoolReallocated**(`poolKey`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:258](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L258)

Chamado quando um pool com `poolKey` tem seu buffer realocado pelo
ResourceSystem (growth 2× ou regeneração). Subclasses que cacheiam
`BindGroupSpec` dependentes do pool devem invalidar o cache aqui
(set para null) para que a próxima dispatch reconstrua via
`resources.poolBindGroup(poolKey)`.

#### Parameters

##### poolKey

`string`

#### Returns

`void`

#### Overrides

`Flow.onPoolReallocated`

***

### reportContactOverflow()

> `protected` **reportContactOverflow**(`counter`): `void`

Defined in: [elements/physics/flows/LCPFlow.ts:894](https://github.com/dantasgut/clayflow/blob/dea47c52919ac4b22646c9711a2b32439da41ebd/src/elements/physics/flows/LCPFlow.ts#L894)

Avisa (uma vez) quando a narrowphase encontrou mais contatos que a capacidade da lista compactada.

#### Parameters

##### counter

`ArrayBuffer`

#### Returns

`void`
