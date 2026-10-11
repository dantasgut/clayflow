[**webgpu-engine**](../../README.md)

***

[webgpu-engine](../../modules.md) / [presentation](../README.md) / Application

# Class: Application

Defined in: [presentation/app/Application.ts:97](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L97)

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

Defined in: [presentation/app/Application.ts:113](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L113)

Canvas HTML attachado. Mesmo objeto passado em `create({canvas})`.

***

### defaults

> `readonly` **defaults**: [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [presentation/app/Application.ts:111](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L111)

Refs para os Flows default (Forward, Shadow, Post, UI, Debug). Útil
para customizar (e.g. `app.defaults.post.addEffect(new Bloom(...))`).

***

### flows

> `readonly` **flows**: `FlowRegistry`

Defined in: [presentation/app/Application.ts:101](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L101)

FlowRegistry — registro de Flows ativos. Atalho para `scene.flows`.

***

### time

> `readonly` **time**: [`Time`](Time.md)

Defined in: [presentation/app/Application.ts:106](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L106)

Relógio da cena (o mesmo `Time` do World, compartilhado por todas as aplicações da cena): escala, pausa,
passo fixo da física. Avança a cada quadro do laço ou de `step()`.

***

### world

> `readonly` **world**: `World`

Defined in: [presentation/app/Application.ts:99](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L99)

World ECS-like — query/insert/remove de Resources. Atalho para `scene.world`.

## Accessors

### capabilities

#### Get Signature

> **get** **capabilities**(): `DeviceCapabilities`

Defined in: [presentation/app/Application.ts:275](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L275)

Capacidades efetivas do device (adaptador, features, limites) — ver `DeviceCapabilities`.

##### Returns

`DeviceCapabilities`

***

### consumers

#### Get Signature

> **get** **consumers**(): `ConsumerResolverRegistry`

Defined in: [presentation/app/Application.ts:369](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L369)

Registry de ConsumerResolvers — usado por LayoutInferencer.

##### Returns

`ConsumerResolverRegistry`

***

### core

#### Get Signature

> **get** **core**(): `EngineCore`

Defined in: [presentation/app/Application.ts:357](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L357)

Acesso direto à Camada 1 (EngineCore) para casos avançados.

##### Returns

`EngineCore`

***

### events

#### Get Signature

> **get** **events**(): `EventBus`

Defined in: [presentation/app/Application.ts:361](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L361)

EventBus do scene — pub/sub tipado para todos os eventos da engine.

##### Returns

`EventBus`

***

### executionSystem

#### Get Signature

> **get** **executionSystem**(): `ExecutionSystem`

Defined in: [presentation/app/Application.ts:377](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L377)

ExecutionSystem — orquestra dispatch de Flows por frameTick.

##### Returns

`ExecutionSystem`

***

### layoutInferencer

#### Get Signature

> **get** **layoutInferencer**(): `LayoutInferencer`

Defined in: [presentation/app/Application.ts:373](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L373)

LayoutInferencer — deriva bindings GPU a partir de WGSL parsed AST.

##### Returns

`LayoutInferencer`

***

### resources

#### Get Signature

> **get** **resources**(): `ResourceSystem`

Defined in: [presentation/app/Application.ts:365](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L365)

ResourceSystem — gerencia lifecycle de Resources e pools GPU.

##### Returns

`ResourceSystem`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [presentation/app/Application.ts:326](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L326)

Para o loop, dispõe plugins (ordem reversa de instalação), remove
event listeners (resize, memory) e — se foi criada com `scene` próprio
— chama `scene.dispose()` para liberar GPU device.

#### Returns

`void`

***

### handleResize()

> **handleResize**(): `void`

Defined in: [presentation/app/Application.ts:298](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L298)

Re-sincroniza canvas.width/height com clientWidth/clientHeight × DPR,
reconfigura o swapchain do core, e emite `canvasReconfigured` para
que Flows recriem suas textures size-dependent.

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [presentation/app/Application.ts:241](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L241)

True se o GameLoop está ativo (RAF agendado).

#### Returns

`boolean`

***

### readyForFrame()

> **readyForFrame**(): `boolean`

Defined in: [presentation/app/Application.ts:270](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L270)

`true` quando a GPU tem espaço para mais um quadro (`framesInFlight < maxFramesInFlight`). O laço só grava
nesse caso; quem avança por `step()` (ex.: o benchmark) consulta para seguir o mesmo ritmo.

#### Returns

`boolean`

***

### requestNewDevice()

> **requestNewDevice**(): `Promise`\<`void`\>

Defined in: [presentation/app/Application.ts:287](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L287)

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

Defined in: [presentation/app/Application.ts:231](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L231)

Inicia o GameLoop (RAF). Chama isso após inserir entidades no World.

#### Returns

`void`

***

### step()

> **step**(`dt?`, `frames?`): `void`

Defined in: [presentation/app/Application.ts:254](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L254)

Avança `frames` quadros de `dt` segundos sem o laço (headless, testes, pré-cálculo, benchmark). Cada quadro
segue o mesmo caminho do `GameLoop`: `time.advance(dt)` e `frameTick` síncrono — `step(1/60, 300)` produz o
mesmo estado que 5 s de laço com `fixedDt` 1/60.

#### Parameters

##### dt?

`number` = `...`

Duração real de cada quadro (s). Default: `time.fixedDt ?? 1/60`.

##### frames?

`number` = `1`

Quantidade de quadros (inteiro ≥ 1). Default 1.

#### Returns

`void`

#### Throws

Error se o laço está rodando; RangeError se `frames` é inválido.

***

### stop()

> **stop**(): `void`

Defined in: [presentation/app/Application.ts:236](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L236)

Pausa o GameLoop (RAF). Reversível via `start()`.

#### Returns

`void`

***

### use()

> **use**(`plugin`): `this`

Defined in: [presentation/app/Application.ts:224](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L224)

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

Defined in: [presentation/app/Application.ts:195](https://github.com/dantasgut/clayflow/blob/b17d5d6aad8e58344ec396008fda32fab9b22987/src/presentation/app/Application.ts#L195)

Construtor async — inicializa GPU device + canvas, registra os Flows
default + plugins (`options.plugins`), e retorna a `Application` pronta
para `start()`. Se `options.scene` é fornecido usa contexto isolado
(multi-Application); caso contrário usa o singleton default.

#### Parameters

##### options

[`ApplicationOptions`](../interfaces/ApplicationOptions.md)

#### Returns

`Promise`\<`Application`\>
