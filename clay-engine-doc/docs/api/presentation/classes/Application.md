[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Application

# Class: Application

Defined in: [presentation/app/Application.ts:73](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L73)

Application — bootstrap das 4 camadas da engine sobre um `<canvas>`.

Ciclo de vida:
  1. `await Application.create({ canvas })` adquire device/queue, configura
     swapchain, instancia `World`/`EventBus`/`ResourceSystem`/`FlowRegistry`,
     e registra defaults (`ShadowFlow + ForwardFlow + PostFlow + UIFlow + DebugFlow`).
  2. `app.world.insert(entity)` para cada entidade da cena. Resources
     indexados disparam alocação de buffers/binds reativamente.
  3. `app.start()` inicia o `GameLoop` (RAF), que emite `frameTick` e cada
     Flow ready dispatcha seus passes dentro de `core.record(...)` + `submit()`.
  4. `app.stop()` pausa o RAF; `app.dispose()` desfaz event listeners.

Resize: por padrão (`autoResize: true` em browser) anexa um listener em
`window.resize` debounced 100ms que reconfigura o canvas + emite
`canvasReconfigured`, e os flows recriam textures size-dependent via
`Flow.onCanvasResized`.

## Properties

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [presentation/app/Application.ts:86](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L86)

Canvas HTML attachado. Mesmo objeto passado em `create({canvas})`.

***

### defaults

> `readonly` **defaults**: [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [presentation/app/Application.ts:84](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L84)

Refs para os Flows default (Forward, Shadow, Post, UI, Debug). Útil
para customizar (e.g. `app.defaults.post.addEffect(new Bloom(...))`).

***

### flows

> `readonly` **flows**: `FlowRegistry`

Defined in: [presentation/app/Application.ts:77](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L77)

FlowRegistry — registro de Flows ativos. Atalho para `scene.flows`.

***

### time

> `readonly` **time**: [`Time`](Time.md)

Defined in: [presentation/app/Application.ts:79](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L79)

Resource especial com `dt` e `elapsed` atualizados pelo GameLoop.

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/app/Application.ts:75](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L75)

World ECS-like — query/insert/remove de Resources. Atalho para `scene.world`.

## Accessors

### consumers

#### Get Signature

> **get** **consumers**(): `ConsumerResolverRegistry`

Defined in: [presentation/app/Application.ts:302](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L302)

Registry de ConsumerResolvers — usado por LayoutInferencer.

##### Returns

`ConsumerResolverRegistry`

***

### core

#### Get Signature

> **get** **core**(): `EngineCore`

Defined in: [presentation/app/Application.ts:290](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L290)

Acesso direto à Camada 1 (EngineCore) para casos avançados.

##### Returns

`EngineCore`

***

### events

#### Get Signature

> **get** **events**(): `EventBus`

Defined in: [presentation/app/Application.ts:294](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L294)

EventBus do scene — pub/sub tipado para todos os eventos da engine.

##### Returns

`EventBus`

***

### executionSystem

#### Get Signature

> **get** **executionSystem**(): `ExecutionSystem`

Defined in: [presentation/app/Application.ts:310](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L310)

ExecutionSystem — orquestra dispatch de Flows por frameTick.

##### Returns

`ExecutionSystem`

***

### layoutInferencer

#### Get Signature

> **get** **layoutInferencer**(): `LayoutInferencer`

Defined in: [presentation/app/Application.ts:306](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L306)

LayoutInferencer — deriva bindings GPU a partir de WGSL parsed AST.

##### Returns

`LayoutInferencer`

***

### resources

#### Get Signature

> **get** **resources**(): `ResourceSystem`

Defined in: [presentation/app/Application.ts:298](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L298)

ResourceSystem — gerencia lifecycle de Resources e pools GPU.

##### Returns

`ResourceSystem`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [presentation/app/Application.ts:261](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L261)

Para o loop, dispõe plugins (ordem reversa de instalação), remove
event listeners (resize, memory) e — se foi criada com `scene` próprio
— chama `scene.dispose()` para liberar GPU device.

#### Returns

`void`

***

### handleResize()

> **handleResize**(): `void`

Defined in: [presentation/app/Application.ts:233](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L233)

Re-sincroniza canvas.width/height com clientWidth/clientHeight × DPR,
reconfigura o swapchain do core, e emite `canvasReconfigured` para
que Flows recriem suas textures size-dependent.

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/Application.ts:210](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L210)

True se o GameLoop está ativo (RAF agendado).

#### Returns

`boolean`

***

### requestNewDevice()

> **requestNewDevice**(): `Promise`\<`void`\>

Defined in: [presentation/app/Application.ts:222](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L222)

Recupera após `deviceLost`. Re-cria GPUDevice (via navigator.gpu) e
re-attacha o canvas. Ao final, emite `deviceRecovered` para que
sistemas reativos (ResourceSystem, Flows) reconstruam buffers/pipelines.

Recomendado consumir via `app.events.on('deviceLost', () => app.requestNewDevice())`
— ou implementar política mais sofisticada (e.g. backoff, max retries).

#### Returns

`Promise`\<`void`\>

***

### start()

> **start**(): `void`

Defined in: [presentation/app/Application.ts:200](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L200)

Inicia o GameLoop (RAF). Chama isso após inserir entidades no World.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/Application.ts:205](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L205)

Pausa o GameLoop (RAF). Reversível via `start()`.

#### Returns

`void`

***

### use()

> **use**(`plugin`): `this`

Defined in: [presentation/app/Application.ts:193](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L193)

Instala um plugin. O `plugin.install(this)` roda imediatamente, então
pode registrar flows, eventos, etc. Múltiplos plugins instalados
serão `dispose()`-ados em ordem reversa quando `app.dispose()`.

#### Parameters

##### plugin

[`EnginePlugin`](../interfaces/EnginePlugin.md)

#### Returns

`this`

***

### create()

> `static` **create**(`options`): `Promise`\<`Application`\>

Defined in: [presentation/app/Application.ts:167](https://github.com/dantasgut/clayflow/blob/6109485920a9f71388790be57c241973781b2157/src/presentation/app/Application.ts#L167)

Construtor async — inicializa GPU device + canvas, registra os Flows
default + plugins (`options.plugins`), e retorna a `Application` pronta
para `start()`. Se `options.scene` é fornecido usa contexto isolado
(multi-Application); caso contrário usa o singleton default.

#### Parameters

##### options

[`ApplicationOptions`](../interfaces/ApplicationOptions.md)

#### Returns

`Promise`\<`Application`\>
