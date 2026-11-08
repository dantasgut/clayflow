[**clayflow**](../../README.md)

***

[clayflow](../../modules.md) / [presentation](../README.md) / Engine

# Class: Engine

Defined in: [src/presentation/app/Engine.ts:142](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L142)

Engine — bootstrap das 4 camadas do motor sobre uma superfície de apresentação qualquer (spec 038: o núcleo, sem
ambiente). Os pontos de entrada a estendem: o `Application` do `clayflow/web` (o canvas, o redimensionamento, o DOM)
e o do `clayflow/deno` (a textura ou a janela).

Ciclo de vida:
  1. `await Engine.create({ platform, surface })` (ou o `Application.create` do ponto de entrada) adquire o device,
     configura a superfície, instancia `World`/`EventBus`/`ResourceSystem`/`FlowRegistry` e registra por factory os
     estágios padrão (`TransformFlow`, `ShadowFlow`, `ForwardFlow`, `PostFlow`, `DebugFlow`, `UIFlow` e os solvers),
     inserindo os alvos do quadro (`FrameTargets`).
  2. `app.world.insert(entity)` para cada entidade da cena. Resources indexados disparam alocação de buffers/binds
     reativamente.
  3. `app.start()` inicia o `GameLoop` (pelo agendador do ambiente), que emite `frameTick`; cada Flow pronto
     (`flowReady`) grava os seus passes dentro de `core.record(...)` + `submit()`. Sem agendador, `step()`.
  4. `app.stop()` pausa o laço; `app.dispose()` desfaz o que foi ligado.

Tamanho: quem muda a superfície (o ponto de entrada) chama `surfaceResized()`, que reconfigura a apresentação e emite
`canvasReconfigured`: a C2 recria as texturas do tamanho dela e os Flows os seus recursos privados.

## Extended by

- [`Application`](../../platform/web/classes/Application.md)
- [`Application`](../../platform/deno/classes/Application.md)

## Constructors

### Constructor

> `protected` **new Engine**(`options`, `prepared`): `Engine`

Defined in: [src/presentation/app/Engine.ts:176](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L176)

#### Parameters

##### options

[`EngineOptions`](../interfaces/EngineOptions.md)

##### prepared

[`PreparedEngine`](../interfaces/PreparedEngine.md)

#### Returns

`Engine`

## Properties

### defaults

> `readonly` **defaults**: [`PresentationDefaults`](../interfaces/PresentationDefaults.md)

Defined in: [src/presentation/app/Engine.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L156)

Refs para os Flows default (Forward, Shadow, Post, UI, Debug). Útil
para customizar (e.g. `app.defaults.post.addEffect(new Bloom(...))`).

***

### flows

> `readonly` **flows**: [`FlowRegistry`](../../platform/web/classes/FlowRegistry.md)

Defined in: [src/presentation/app/Engine.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L146)

FlowRegistry — registro de Flows ativos. Atalho para `scene.flows`.

***

### input

> `readonly` **input**: [`Input`](Input.md)

Defined in: [src/presentation/app/Engine.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L163)

Entrada da cena (spec 007): Resource singleton no World — consulta (`isKeyDown`, `pointerDelta`, …) e eventos no
barramento (`keyDown`, `pointerMove`, `wheel`, …). Compartilhado pelas aplicações da mesma cena.

***

### interaction

> `readonly` **interaction**: [`InteractionSystem`](InteractionSystem.md)

Defined in: [src/presentation/app/Engine.ts:165](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L165)

Liga os dispositivos ao `input` e tica os controllers da cena (componentes da entidade da câmera).

***

### scene

> `protected` `readonly` **scene**: [`SceneContext`](../../platform/web/interfaces/SceneContext.md)

Defined in: [src/presentation/app/Engine.ts:166](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L166)

***

### surface

> `readonly` **surface**: [`PresentationSurface`](../../platform/web/interfaces/PresentationSurface.md) \| `undefined`

Defined in: [src/presentation/app/Engine.ts:158](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L158)

A superfície de apresentação (o canvas, a janela ou a textura; `undefined` sem tela).

***

### time

> `readonly` **time**: [`Time`](Time.md)

Defined in: [src/presentation/app/Engine.ts:151](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L151)

Relógio da cena (o mesmo `Time` do World, compartilhado por todas as aplicações da cena): escala, pausa,
passo fixo da física. Avança a cada quadro do laço ou de `step()`.

***

### world

> `readonly` **world**: [`World`](../../platform/web/classes/World.md)

Defined in: [src/presentation/app/Engine.ts:144](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L144)

World ECS-like — query/insert/remove de Resources. Atalho para `scene.world`.

## Accessors

### capabilities

#### Get Signature

> **get** **capabilities**(): [`DeviceCapabilities`](../../platform/web/interfaces/DeviceCapabilities.md)

Defined in: [src/presentation/app/Engine.ts:376](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L376)

Capacidades efetivas do device (adaptador, features, limites) — ver `DeviceCapabilities`.

##### Returns

[`DeviceCapabilities`](../../platform/web/interfaces/DeviceCapabilities.md)

***

### consumers

#### Get Signature

> **get** **consumers**(): [`ConsumerResolverRegistry`](../../platform/web/classes/ConsumerResolverRegistry.md)

Defined in: [src/presentation/app/Engine.ts:469](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L469)

Registry de ConsumerResolvers — usado por LayoutInferencer.

##### Returns

[`ConsumerResolverRegistry`](../../platform/web/classes/ConsumerResolverRegistry.md)

***

### core

#### Get Signature

> **get** **core**(): [`EngineCore`](../../platform/web/interfaces/EngineCore.md)

Defined in: [src/presentation/app/Engine.ts:439](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L439)

Acesso direto à Camada 1 (EngineCore) para casos avançados.

##### Returns

[`EngineCore`](../../platform/web/interfaces/EngineCore.md)

***

### events

#### Get Signature

> **get** **events**(): [`EventBus`](../../platform/web/interfaces/EventBus.md)

Defined in: [src/presentation/app/Engine.ts:443](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L443)

EventBus do scene — pub/sub tipado para todos os eventos da engine.

##### Returns

[`EventBus`](../../platform/web/interfaces/EventBus.md)

***

### executionSystem

#### Get Signature

> **get** **executionSystem**(): [`ExecutionSystem`](../../platform/web/classes/ExecutionSystem.md)

Defined in: [src/presentation/app/Engine.ts:477](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L477)

ExecutionSystem — orquestra dispatch de Flows por frameTick.

##### Returns

[`ExecutionSystem`](../../platform/web/classes/ExecutionSystem.md)

***

### layoutInferencer

#### Get Signature

> **get** **layoutInferencer**(): [`LayoutInferencer`](../../platform/web/classes/LayoutInferencer.md)

Defined in: [src/presentation/app/Engine.ts:473](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L473)

LayoutInferencer — deriva bindings GPU a partir de WGSL parsed AST.

##### Returns

[`LayoutInferencer`](../../platform/web/classes/LayoutInferencer.md)

***

### resources

#### Get Signature

> **get** **resources**(): [`ResourceSystem`](../../platform/web/classes/ResourceSystem.md)

Defined in: [src/presentation/app/Engine.ts:465](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L465)

ResourceSystem — gerencia lifecycle de Resources e pools GPU.

##### Returns

[`ResourceSystem`](../../platform/web/classes/ResourceSystem.md)

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/app/Engine.ts:418](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L418)

Para o loop, dispõe plugins (ordem reversa de instalação), desfaz o que o ponto de entrada ligou (o
redimensionamento, os ouvintes do ambiente) e o aviso de memória e — se foi criada com `scene` próprio
— chama `scene.dispose()` para liberar GPU device.

#### Returns

`void`

***

### disposeEnvironment()

> `protected` **disposeEnvironment**(): `void`

Defined in: [src/presentation/app/Engine.ts:411](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L411)

O que o ponto de entrada desfaz no descarte (os ouvintes do ambiente), antes da cena.

#### Returns

`void`

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [src/presentation/app/Engine.ts:293](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L293)

True se o GameLoop está ativo (RAF agendado ou esperando espaço na GPU).

#### Returns

`boolean`

***

### readyForFrame()

> **readyForFrame**(): `boolean`

Defined in: [src/presentation/app/Engine.ts:371](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L371)

`true` quando a GPU tem espaço para mais um quadro (`framesInFlight < maxFramesInFlight`). O laço só grava
nesse caso; quem avança por `step()` (ex.: o benchmark) consulta para seguir o mesmo ritmo.

#### Returns

`boolean`

***

### requestNewDevice()

> **requestNewDevice**(): `Promise`\<`void`\>

Defined in: [src/presentation/app/Engine.ts:388](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L388)

Recupera após `deviceLost`. Re-cria o GPUDevice (pelo adaptador de plataforma) e
re-attacha a superfície. Ao final, emite `deviceRecovered` para que
sistemas reativos (ResourceSystem, Flows) reconstruam buffers/pipelines.

Recomendado consumir via `app.events.on('deviceLost', () => app.requestNewDevice())`
— ou implementar política mais sofisticada (e.g. backoff, max retries).

#### Returns

`Promise`\<`void`\>

***

### setProfiling()

> **setProfiling**(`profiling`, `capacity?`): `void`

Defined in: [src/presentation/app/Engine.ts:452](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L452)

Liga, troca ou desliga o profiling de GPU com a aplicação rodando (spec 039, T102), com o mesmo significado da
opção `profiling` da criação: `'passes'` dá o tempo de cada estágio (`gpuFrameTimed.flowsMs`) — no Apple os
carimbos por passe deixam os passes de desenho mais lentos, então esse modo é para a tabela por estágio, não para
o tempo do quadro; `'frame'`, só o total; `false` desliga.

#### Parameters

##### profiling

`boolean` \| [`FrameProfilingGranularity`](../../platform/web/type-aliases/FrameProfilingGranularity.md)

##### capacity?

`number`

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/presentation/app/Engine.ts:283](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L283)

Inicia o GameLoop (RAF). Chama isso após inserir entidades no World.

#### Returns

`void`

***

### step()

> **step**(`dt?`, `frames?`): `void`

Defined in: [src/presentation/app/Engine.ts:306](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L306)

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

Defined in: [src/presentation/app/Engine.ts:288](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L288)

Pausa o GameLoop (RAF). Reversível via `start()`.

#### Returns

`void`

***

### surfaceResized()

> **surfaceResized**(): `void`

Defined in: [src/presentation/app/Engine.ts:399](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L399)

A superfície mudou de tamanho (spec 038: o ponto de entrada avisa — o canvas redimensionado, a janela, a textura):
reconfigura a apresentação no core e emite `canvasReconfigured` para que os Flows recriem as texturas do tamanho
dela.

#### Returns

`void`

***

### use()

> **use**(`plugin`): `this`

Defined in: [src/presentation/app/Engine.ts:276](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L276)

Instala um plugin. O `plugin.install(this)` roda imediatamente, então
pode registrar flows, eventos, etc. Múltiplos plugins instalados
serão `dispose()`-ados em ordem reversa quando `app.dispose()`.

#### Parameters

##### plugin

[`EnginePlugin`](../interfaces/EnginePlugin.md)

#### Returns

`this`

***

### whenReady()

> **whenReady**(`options?`): `Promise`\<`void`\>

Defined in: [src/presentation/app/Engine.ts:330](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L330)

Espera o motor ficar pronto (spec 034): nenhum Flow ativo com pipeline sem fonte, em conferência, compilando ou
trocando, avaliado num quadro gravado depois desta chamada (o que acabou de ser inserido entra na conta). Com o
laço parado, avança quadros vazios (`step(0)`, sem tempo de simulação) cedendo ao navegador entre eles e só com
espaço na GPU (`readyForFrame`: os quadros em andamento abaixo do teto, como o laço); com o
laço rodando, só observa os quadros dele. O tempo da simulação nunca é tocado.

#### Parameters

##### options?

###### timeoutMs?

`number`

Prazo (padrão 30 000 ms).

#### Returns

`Promise`\<`void`\>

#### Throws

Error ao vencer o prazo, listando o que ainda está pendente (Flow, pipeline, motivo, binding).

***

### create()

> `static` **create**(`options`): `Promise`\<`Engine`\>

Defined in: [src/presentation/app/Engine.ts:231](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L231)

Construtor async — inicializa o device pelo adaptador de plataforma e a superfície, registra os Flows padrão e
devolve o motor pronto para `start()`/`step()`. Se `options.scene` é fornecido usa contexto isolado (várias
aplicações); caso contrário usa o singleton default.

#### Parameters

##### options

[`EngineOptions`](../interfaces/EngineOptions.md)

#### Returns

`Promise`\<`Engine`\>

***

### prepareFor()

> `protected` `static` **prepareFor**(`options`): `Promise`\<[`PreparedEngine`](../interfaces/PreparedEngine.md)\>

Defined in: [src/presentation/app/Engine.ts:236](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L236)

A parte assíncrona da criação (os pontos de entrada a usam antes de construir a subclasse).

#### Parameters

##### options

[`EngineOptions`](../interfaces/EngineOptions.md)

#### Returns

`Promise`\<[`PreparedEngine`](../interfaces/PreparedEngine.md)\>
