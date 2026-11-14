[**clayflow**](../../../README.md)

***

[clayflow](../../../modules.md) / [platform/deno](../README.md) / Application

# Class: Application

Defined in: [src/platform/deno/Application.ts:44](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L44)

Application — o motor no Deno (spec 038, `clayflow/deno`): o `Engine` com o adaptador de plataforma do Deno (o
`navigator.gpu` do wgpu) e, conforme o alvo, a janela SDL (o laço do Deno, os eventos da janela no `Input`, a
apresentação depois de cada quadro, o redimensionamento) ou a textura lida de volta.

```ts
import { Application, createScene } from 'clayflow/deno';
const app = await Application.create({ window: { title: 'clayflow', width: 1280, height: 720 }, scene: createScene() });
// … a cena …
await app.run(); // até a janela fechar
```

## Extends

- [`Engine`](../../../presentation/classes/Engine.md)

## Properties

### defaults

> `readonly` **defaults**: [`PresentationDefaults`](../../../presentation/interfaces/PresentationDefaults.md)

Defined in: [src/presentation/app/Engine.ts:156](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L156)

Refs para os Flows default (Forward, Shadow, Post, UI, Debug). Útil
para customizar (e.g. `app.defaults.post.addEffect(new Bloom(...))`).

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`defaults`](../../../presentation/classes/Engine.md#defaults)

***

### flows

> `readonly` **flows**: [`FlowRegistry`](../../web/classes/FlowRegistry.md)

Defined in: [src/presentation/app/Engine.ts:146](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L146)

FlowRegistry — registro de Flows ativos. Atalho para `scene.flows`.

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`flows`](../../../presentation/classes/Engine.md#flows)

***

### input

> `readonly` **input**: [`Input`](../../../presentation/classes/Input.md)

Defined in: [src/presentation/app/Engine.ts:163](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L163)

Entrada da cena (spec 007): Resource singleton no World — consulta (`isKeyDown`, `pointerDelta`, …) e eventos no
barramento (`keyDown`, `pointerMove`, `wheel`, …). Compartilhado pelas aplicações da mesma cena.

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`input`](../../../presentation/classes/Engine.md#input)

***

### interaction

> `readonly` **interaction**: [`InteractionSystem`](../../../presentation/classes/InteractionSystem.md)

Defined in: [src/presentation/app/Engine.ts:165](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L165)

Liga os dispositivos ao `input` e tica os controllers da cena (componentes da entidade da câmera).

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`interaction`](../../../presentation/classes/Engine.md#interaction)

***

### scene

> `protected` `readonly` **scene**: [`SceneContext`](../../web/interfaces/SceneContext.md)

Defined in: [src/presentation/app/Engine.ts:166](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L166)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`scene`](../../../presentation/classes/Engine.md#scene)

***

### surface

> `readonly` **surface**: [`PresentationSurface`](../../web/interfaces/PresentationSurface.md) \| `undefined`

Defined in: [src/presentation/app/Engine.ts:158](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L158)

A superfície de apresentação (o canvas, a janela ou a textura; `undefined` sem tela).

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`surface`](../../../presentation/classes/Engine.md#surface)

***

### time

> `readonly` **time**: [`Time`](../../../presentation/classes/Time.md)

Defined in: [src/presentation/app/Engine.ts:151](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L151)

Relógio da cena (o mesmo `Time` do World, compartilhado por todas as aplicações da cena): escala, pausa,
passo fixo da física. Avança a cada quadro do laço ou de `step()`.

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`time`](../../../presentation/classes/Engine.md#time)

***

### window

> `readonly` **window**: [`SdlWindow`](SdlWindow.md) \| `undefined`

Defined in: [src/platform/deno/Application.ts:46](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L46)

A janela (no modo janela).

***

### world

> `readonly` **world**: [`World`](../../web/classes/World.md)

Defined in: [src/presentation/app/Engine.ts:144](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L144)

World ECS-like — query/insert/remove de Resources. Atalho para `scene.world`.

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`world`](../../../presentation/classes/Engine.md#world)

## Accessors

### capabilities

#### Get Signature

> **get** **capabilities**(): [`DeviceCapabilities`](../../web/interfaces/DeviceCapabilities.md)

Defined in: [src/presentation/app/Engine.ts:376](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L376)

Capacidades efetivas do device (adaptador, features, limites) — ver `DeviceCapabilities`.

##### Returns

[`DeviceCapabilities`](../../web/interfaces/DeviceCapabilities.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`capabilities`](../../../presentation/classes/Engine.md#capabilities)

***

### consumers

#### Get Signature

> **get** **consumers**(): [`ConsumerResolverRegistry`](../../web/classes/ConsumerResolverRegistry.md)

Defined in: [src/presentation/app/Engine.ts:469](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L469)

Registry de ConsumerResolvers — usado por LayoutInferencer.

##### Returns

[`ConsumerResolverRegistry`](../../web/classes/ConsumerResolverRegistry.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`consumers`](../../../presentation/classes/Engine.md#consumers)

***

### core

#### Get Signature

> **get** **core**(): [`EngineCore`](../../web/interfaces/EngineCore.md)

Defined in: [src/presentation/app/Engine.ts:439](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L439)

Acesso direto à Camada 1 (EngineCore) para casos avançados.

##### Returns

[`EngineCore`](../../web/interfaces/EngineCore.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`core`](../../../presentation/classes/Engine.md#core)

***

### events

#### Get Signature

> **get** **events**(): [`EventBus`](../../web/interfaces/EventBus.md)

Defined in: [src/presentation/app/Engine.ts:443](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L443)

EventBus do scene — pub/sub tipado para todos os eventos da engine.

##### Returns

[`EventBus`](../../web/interfaces/EventBus.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`events`](../../../presentation/classes/Engine.md#events)

***

### executionSystem

#### Get Signature

> **get** **executionSystem**(): [`ExecutionSystem`](../../web/classes/ExecutionSystem.md)

Defined in: [src/presentation/app/Engine.ts:477](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L477)

ExecutionSystem — orquestra dispatch de Flows por frameTick.

##### Returns

[`ExecutionSystem`](../../web/classes/ExecutionSystem.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`executionSystem`](../../../presentation/classes/Engine.md#executionsystem)

***

### layoutInferencer

#### Get Signature

> **get** **layoutInferencer**(): [`LayoutInferencer`](../../web/classes/LayoutInferencer.md)

Defined in: [src/presentation/app/Engine.ts:473](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L473)

LayoutInferencer — deriva bindings GPU a partir de WGSL parsed AST.

##### Returns

[`LayoutInferencer`](../../web/classes/LayoutInferencer.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`layoutInferencer`](../../../presentation/classes/Engine.md#layoutinferencer)

***

### resources

#### Get Signature

> **get** **resources**(): [`ResourceSystem`](../../web/classes/ResourceSystem.md)

Defined in: [src/presentation/app/Engine.ts:465](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L465)

ResourceSystem — gerencia lifecycle de Resources e pools GPU.

##### Returns

[`ResourceSystem`](../../web/classes/ResourceSystem.md)

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`resources`](../../../presentation/classes/Engine.md#resources)

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/presentation/app/Engine.ts:418](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L418)

Para o loop, dispõe plugins (ordem reversa de instalação), desfaz o que o ponto de entrada ligou (o
redimensionamento, os ouvintes do ambiente) e o aviso de memória e — se foi criada com `scene` próprio
— chama `scene.dispose()` para liberar GPU device.

#### Returns

`void`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`dispose`](../../../presentation/classes/Engine.md#dispose)

***

### disposeEnvironment()

> `protected` **disposeEnvironment**(): `void`

Defined in: [src/platform/deno/Application.ts:173](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L173)

O que o ponto de entrada desfaz no descarte (os ouvintes do ambiente), antes da cena.

#### Returns

`void`

#### Overrides

[`Engine`](../../../presentation/classes/Engine.md).[`disposeEnvironment`](../../../presentation/classes/Engine.md#disposeenvironment)

***

### isRunning()

> **isRunning**(): `boolean`

Defined in: [src/presentation/app/Engine.ts:293](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L293)

True se o GameLoop está ativo (RAF agendado ou esperando espaço na GPU).

#### Returns

`boolean`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`isRunning`](../../../presentation/classes/Engine.md#isrunning)

***

### read()

> **read**(): `Promise`\<[`CanvasPixels`](../../web/interfaces/CanvasPixels.md)\>

Defined in: [src/platform/deno/Application.ts:133](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L133)

Os pixels do último quadro (o modo textura; chame logo depois de `step`).

#### Returns

`Promise`\<[`CanvasPixels`](../../web/interfaces/CanvasPixels.md)\>

***

### readyForFrame()

> **readyForFrame**(): `boolean`

Defined in: [src/presentation/app/Engine.ts:371](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L371)

`true` quando a GPU tem espaço para mais um quadro (`framesInFlight < maxFramesInFlight`). O laço só grava
nesse caso; quem avança por `step()` (ex.: o benchmark) consulta para seguir o mesmo ritmo.

#### Returns

`boolean`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`readyForFrame`](../../../presentation/classes/Engine.md#readyforframe)

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

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`requestNewDevice`](../../../presentation/classes/Engine.md#requestnewdevice)

***

### run()

> **run**(): `Promise`\<`void`\>

Defined in: [src/platform/deno/Application.ts:138](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L138)

Roda o laço até a janela fechar (o modo janela).

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

`boolean` \| [`FrameProfilingGranularity`](../../web/type-aliases/FrameProfilingGranularity.md)

##### capacity?

`number`

#### Returns

`void`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`setProfiling`](../../../presentation/classes/Engine.md#setprofiling)

***

### start()

> **start**(): `void`

Defined in: [src/presentation/app/Engine.ts:283](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L283)

Inicia o GameLoop (RAF). Chama isso após inserir entidades no World.

#### Returns

`void`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`start`](../../../presentation/classes/Engine.md#start)

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

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`step`](../../../presentation/classes/Engine.md#step)

***

### stop()

> **stop**(): `void`

Defined in: [src/presentation/app/Engine.ts:288](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L288)

Pausa o GameLoop (RAF). Reversível via `start()`.

#### Returns

`void`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`stop`](../../../presentation/classes/Engine.md#stop)

***

### surfaceResized()

> **surfaceResized**(): `void`

Defined in: [src/presentation/app/Engine.ts:399](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L399)

A superfície mudou de tamanho (spec 038: o ponto de entrada avisa — o canvas redimensionado, a janela, a textura):
reconfigura a apresentação no core e emite `canvasReconfigured` para que os Flows recriem as texturas do tamanho
dela.

#### Returns

`void`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`surfaceResized`](../../../presentation/classes/Engine.md#surfaceresized)

***

### use()

> **use**(`plugin`): `this`

Defined in: [src/presentation/app/Engine.ts:276](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L276)

Instala um plugin. O `plugin.install(this)` roda imediatamente, então
pode registrar flows, eventos, etc. Múltiplos plugins instalados
serão `dispose()`-ados em ordem reversa quando `app.dispose()`.

#### Parameters

##### plugin

[`EnginePlugin`](../../../presentation/interfaces/EnginePlugin.md)

#### Returns

`this`

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`use`](../../../presentation/classes/Engine.md#use)

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

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`whenReady`](../../../presentation/classes/Engine.md#whenready)

***

### create()

> `static` **create**(`options`): `Promise`\<`Application`\>

Defined in: [src/platform/deno/Application.ts:74](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/platform/deno/Application.ts#L74)

Construtor async — a janela ou a textura, o device pelo Deno e os estágios padrão.

#### Parameters

##### options

[`DenoApplicationOptions`](../type-aliases/DenoApplicationOptions.md)

#### Returns

`Promise`\<`Application`\>

#### Overrides

[`Engine`](../../../presentation/classes/Engine.md).[`create`](../../../presentation/classes/Engine.md#create)

***

### prepareFor()

> `protected` `static` **prepareFor**(`options`): `Promise`\<[`PreparedEngine`](../../../presentation/interfaces/PreparedEngine.md)\>

Defined in: [src/presentation/app/Engine.ts:236](https://github.com/dantasgut/clayflow/blob/9be3ad597671ac7e8dc53b879ebefd3eb752cbd6/src/presentation/app/Engine.ts#L236)

A parte assíncrona da criação (os pontos de entrada a usam antes de construir a subclasse).

#### Parameters

##### options

[`EngineOptions`](../../../presentation/interfaces/EngineOptions.md)

#### Returns

`Promise`\<[`PreparedEngine`](../../../presentation/interfaces/PreparedEngine.md)\>

#### Inherited from

[`Engine`](../../../presentation/classes/Engine.md).[`prepareFor`](../../../presentation/classes/Engine.md#preparefor)
