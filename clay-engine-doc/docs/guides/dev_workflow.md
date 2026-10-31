# Dev workflow

Como desenvolver no Clay Engine: rodar smokes, debugar WGSL, hot-reload e
adicionar componentes novos (Flow, Resource, PostProcessEffect).

## Rodando smokes manualmente

Smokes que precisam de GPUDevice real (compute roundtrip, render pipelines,
60s long-running) ficam em `engine/src/__smokes__/`. Não rodam em CI — o
runner é o Vite dev server + Chrome.

Workflow:

```bash
cd engine
cp src/__smokes__/integration.ts src/main.ts   # escolha o smoke
npm run dev                                     # reinicia o Vite
# abra http://localhost:5173 e veja o console + DOM #log
git restore src/main.ts                         # após o teste
```

**Convenção:** sempre **reinicie** o Vite antes de cada smoke — mudanças em
`src/__smokes__/` mais swap em `main.ts` podem confundir HMR.

Inventário dos smokes em `engine/src/__smokes__/README.md`.

## Gate local de performance (benchmark)

O CI não tem GPU. Mudanças em renderização, física ou no núcleo de GPU passam também pelo gate local:

```bash
npm run typecheck:bench          # tipos do harness (bench/)
npm run bench:check -- --quick   # executa e compara com o baseline da sua máquina
```

`bench:check` reprova (código 1) quando CPU, GPU, p95 ou p99 do clayflow piora mais de 10% contra
`bench/baselines/<perfil>.json`, ou quando uma cena que funcionava passa a falhar. Sem baseline para o seu perfil,
grave um com `npm run bench:baseline`. Detalhes em [Benchmark](./benchmark.md).

## Debugando WGSL

1. **Browser console é a primeira parada** (`F12` no Chrome). Erros de
   compilação WGSL aparecem com mensagem precisa do compiler:
   ```
   Tint WGSL writer error: ... line 42, col 5: ...
   ```
   Não adivinhe — leia o erro literal antes de mudar shader.

2. **Helper validator no createComputeKernel:** ao concatenar WGSL de
   múltiplas libs, é fácil esquecer um helper. O `createComputeKernel` roda
   `validateWgslReferences` que detecta `fn xxx(...)` sem definição. Erro
   tem mensagem clara:
   ```
   [WGSL] reference to 'mat3_from_cols' but no fn defined in kernel "lcp_predict";
   check baseSrc concatenation order or missing helpers.
   ```

3. **Capturar erros runtime:** habilite `captureErrors` na Application:
   ```ts
   const app = await Application.create({ canvas, captureErrors: true });
   app.events.on('engineError', (e) => {
       console.warn(`[${e.stage}/${e.filter}]`, e.message);
   });
   ```
   Erros de validação WebGPU em runtime viram eventos sem crashar o
   GameLoop.

4. **Memory leak / budget:** `app.core.memoryUsage()` retorna
   `{ totalBytes, top: [...] }` para diagnóstico ad-hoc. Para alerta
   contínuo:
   ```ts
   const app = await Application.create({ canvas, memoryBudgetMB: 256 });
   app.events.on('memoryWarning', (e) => {
       console.warn(`memory ${(e.totalBytes / 1024 / 1024).toFixed(1)}MB`, e.top);
   });
   ```

## Hot-reload behavior

Vite trata todos os imports do engine via path real (`vite.config.ts`
aliases `webgpu-engine` → `../engine/src/index.ts`). Mudanças em `.ts` são
HMR'd em milissegundos.

**WGSL** (`?raw` imports): também HMR. Mas como o `discriminator` do shader
inclui o arquivo source via `specHash`, mudar o conteúdo gera um specHash
diferente → o engine cria um shader novo no store em vez de reaproveitar o
antigo. Em prática:
- Frame que renderiza usa o spec novo.
- O spec antigo permanece no store até `core.shutdown()` ou device-lost.

Para forçar limpeza imediata sem reload, você pode chamar
`app.core.requestRecover(canvas)` que destrói o device atual e cria um novo
(emite `deviceRecovered`).

## Adicionando um Flow novo

Um Flow é uma unidade de execução por frame, normalmente uma compute pass
ou render pass. Ele declara slots (inclusive o seu Resource de trabalho, `slot.work`), pipelines e uma tabela
de transições — e não cria objetos de GPU (spec 039); a C2 atribui as ligações dos recursos declarados pelos módulos,
liga os bind groups e decide quando o Flow entra no quadro. Guia completo: [Flows](./flows.md). Esqueleto:

```ts
import { Flow, wgslModule, wgslResource, wgslLib, WORKGROUP_SIZE } from 'webgpu-engine';
import type {
    BoundFlow, FlowTransitions, Frame, GPUDescriptor, PipelineDescriptor, Resource, TransitionContext,
} from 'webgpu-engine';
import { Entity, FieldType, ResourceState, StructSchema, slot } from 'webgpu-engine';
import mySource from './my_flow.wgsl?raw';

// O recurso é declarado (spec 031): o fonte usa `data` sem escrever `@group/@binding` — a montagem emite a linha.
const dataResource = wgslResource({
    name: 'data',
    binding: { storage: 'read_write' },
    type: { wgsl: 'f32', array: true },
    frequency: 'stage',
    provider: { slot: 'work', descriptor: 'data' }, // o descritor do Resource de trabalho, alocado pela C2
});

// O espaço de trabalho: um Resource comum, inserido e removido pela C2 junto com o Flow.
const MyData = new StructSchema('MyData', { v: FieldType.f32 });
class MyWork extends Entity implements Resource {
    static readonly schema = new StructSchema('MyWork', {});
    state = ResourceState.Uninitialized;
    constructor(private readonly count: number) {
        super();
        this.data = {};
    }
    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'data', role: 'storage-rw', schema: MyData, upload: 'never', count: this.count }];
    }
    getPipelineDescriptors() {
        return [];
    }
}
// Módulo de entrada: dependências (inclusive recursos e constantes) por `requires`, structs gerados em `structs`.
const myShader = wgslModule({
    name: 'my_flow',
    source: mySource, // @compute @workgroup_size(WORKGROUP_SIZE) fn my_main(…) { data[i] = … }
    requires: [wgslLib.quat, WORKGROUP_SIZE.module, dataResource],
});

const slots = { work: slot.work(() => new MyWork(1024)) };
type Ctx = TransitionContext<typeof slots>;

export class MyFlow extends Flow<typeof slots, 'idle'> {
    readonly type = 'MyFlow';
    readonly slots = slots;
    // Compilado antes de o Flow ficar pronto; layout lido das declarações do shader montado.
    override readonly pipelines: readonly PipelineDescriptor[] = [
        { id: 'my', role: 'compute', shader: myShader, entryPoints: ['my_main'] },
    ];
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', Ctx> = {
        '*': { slotsResolved: 'ignore', slotLost: 'ignore', pipelinesCompiled: 'ignore', bindGroupReplaced: 'ignore' },
    };

    constructor(private readonly count: number) {
        super();
    }

    dispatch(frame: Frame, bound: BoundFlow<typeof slots>) {
        const p = bound.compute('my'); // bind groups da C2 — leia a cada quadro, não guarde
        frame.compute('MyFlow', (pass) => {
            pass.bind.setPipeline(p.spec);
            p.bindTo(pass.bind); // todos os grupos, sem índices escritos aqui
            pass.dispatch.invocations(this.count, WORKGROUP_SIZE.value); // o shader indexa por num_workgroups
        });
    }
}

// Registro por factory: a fase e a prioridade vêm das opções.
app.flows.register(() => new MyFlow(1024), { type: 'MyFlow', phase: 'physics' });
// Ou via plugin para reutilização:
app.use({
    name: 'my',
    install(a) {
        a.flows.register(() => new MyFlow(dataBuffer, count), { type: 'MyFlow', phase: 'physics' });
    },
});
```

Para um kernel avulso fora de um Flow, `createComputeKernel(core, { discriminator, shader, entryPoint, bindings })`
recebe as fontes **pela identidade do recurso** (`bindings: new Map([[dataResource, dataBuffer]])`) e lê o layout do
mesmo jeito; `kernel.bindTo(pass.bind)` grava os grupos.

## Adicionando um Resource novo

Resource = peça de dados consumida por Flows. Padrão típico (Camera,
Transform, Material): extends `Entity`, implements `Resource`, declara
`schema` (StructSchema) + `getDescriptors()` (GPUDescriptor) e atribui
`this.data = …` no construtor — o campo `data` é o acessor de `Entity`, tipado
pelo parâmetro `TData` (`extends Entity<MyResourceData>`).

```ts
import { Entity, ResourceState, StructSchema, FieldType } from 'webgpu-engine';

export interface MyResourceData {
    value: number;
}

export class MyResource extends Entity<MyResourceData> {
    static readonly schema = new StructSchema('MyResource', {
        value: FieldType.f32,
    });
    state = ResourceState.Uninitialized;
    // Sem campo `data`: o acessor é de `Entity`, tipado por `MyResourceData`.

    constructor(values: Partial<MyResourceData> = {}) {
        super();
        this.data = { value: values.value ?? 0 };
    }

    getDescriptors() {
        return [{ id: 'mine', role: 'uniform' as const, schema: MyResource.schema }];
    }
    getPipelineDescriptors() {
        return [];
    }
}
```

Insert via `app.world.insert(new MyResource())`. ResourceSystem aloca
buffer + bindgroup automaticamente baseado no descriptor.

## Adicionando um PostProcessEffect

```ts
import { PostProcessEffect } from 'webgpu-engine';

export class Sepia extends PostProcessEffect {
    get name() { return 'sepia'; }
    get fragmentEntry() { return 'fs_sepia'; }

    // Opt-in custom WGSL — sem editar effects.wgsl da engine.
    fragmentSource() {
        return `
            @fragment
            fn fs_sepia(@location(0) uv: vec2f) -> @location(0) vec4f {
                let c = textureSample(scene, samp, uv).rgb;
                let r = dot(c, vec3f(0.393, 0.769, 0.189));
                let g = dot(c, vec3f(0.349, 0.686, 0.168));
                let b = dot(c, vec3f(0.272, 0.534, 0.131));
                return vec4f(r, g, b, 1.0);
            }`;
    }
}

app.defaults.post.addEffect(new Sepia({}));
```

(Note: a custom WGSL aqui precisaria também trazer `vs_fullscreen` ou ser
concatenado com a base do `effects.wgsl`. Veja JSDoc de
`PostProcessEffect.fragmentSource()`.)

## Multi-Application (multi-canvas)

```ts
import { Application, createScene } from 'webgpu-engine';

const scene1 = createScene();
const scene2 = createScene();
const app1 = await Application.create({ canvas: c1, scene: scene1 });
const app2 = await Application.create({ canvas: c2, scene: scene2 });
// Cada app tem seu próprio device + world + flows + events.
```
