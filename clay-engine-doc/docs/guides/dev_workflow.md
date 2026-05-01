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
ou render pass. Esqueleto:

```ts
import { Flow, type Phase } from 'webgpu-engine';
import type { Frame, EngineCore } from 'webgpu-engine';

export class MyFlow extends Flow {
    readonly type = 'MyFlow';
    readonly bodyType = '';
    readonly phase: Phase = 'physics'; // ou 'shadow' | 'forward' | 'post' | 'ui'

    constructor(private readonly core: EngineCore) {
        super();
    }

    getPipelineDescriptors() {
        return [];
    }

    override isReady() {
        return true;
    }

    dispatch(frame: Frame) {
        // Use createComputeKernel ou core.compute para reduzir boilerplate.
        const kernel = this.core.compute({
            discriminator: 'my_flow',
            shaderSource: '...',
            entryPoint: 'main',
            bindings: [/* ... */],
        });
        frame.compute('MyFlow', (pass) => {
            pass.bind.setPipeline(kernel.pipeline).setBindGroup(0, kernel.bindGroup);
            pass.dispatch.workgroups(1);
        });
    }
}

// Registro:
app.flows.register(new MyFlow(app.core));
// Ou via plugin para reutilização:
app.use({ name: 'my', install(a) { a.flows.register(new MyFlow(a.core)); } });
```

## Adicionando um Resource novo

Resource = peça de dados consumida por Flows. Padrão típico (Camera,
Transform, Material): extends `Entity`, implements `Resource`, declara
`schema` (StructSchema) + `getDescriptors()` (GPUDescriptor).

```ts
import { Entity, ResourceState, StructSchema, FieldType } from 'webgpu-engine';

export class MyResource extends Entity {
    static readonly schema = new StructSchema('MyResource', {
        value: FieldType.f32,
    });
    state = ResourceState.Uninitialized;
    data: Record<string, unknown> = {};

    constructor(values: Record<string, unknown> = {}) {
        super();
        this.data = MyResource.schema.applyDefaults({ value: values.value ?? 0 });
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
