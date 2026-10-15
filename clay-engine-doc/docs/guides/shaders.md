---
sidebar_position: 13
title: Shaders — módulos WGSL e kernels genéricos
---

# Shaders — módulos WGSL e kernels genéricos

Todo shader do motor é montado a partir de **módulos WGSL** com dependências declaradas. Não há concatenação de texto,
cópia de função entre arquivos nem struct escrito à mão: a matemática vive numa biblioteca (`wgslLib`), os structs são
gerados dos `StructSchema` e os algoritmos paralelos comuns (soma de prefixos, ordenação, compactação, redução,
coloração de grafo) são kernels prontos.

## Módulo

```ts
import { wgslModule, wgslLib } from 'clayflow';
import heightSource from './height.wgsl?raw';

export const height = wgslModule({
    name: 'height',                    // único na montagem
    source: heightSource,              // fonte do arquivo
    requires: [wgslLib.noise],         // módulos de que o fonte depende (por referência)
    structs: [TerrainParams.schema],   // schemas cujos structs o fonte usa
});
```

Um módulo é um valor imutável. Na criação, o fonte é varrido (`fn`, `struct`, `const`, `override`, `alias`, `var` de
escopo de módulo): símbolo definido duas vezes no mesmo módulo é erro imediato.

No motor, só os arquivos de módulo (`shaders.ts` de cada pacote, `elements/gpu/shaders/`, `elements/gpu/compute/`)
importam `.wgsl` — o gate verifica.

## Montagem

`composeWgsl(entrada)` produz a `ShaderModuleSpec` do shader:

1. resolve `requires` em ordem topológica (dependências antes, irmãos na ordem declarada) e inclui cada módulo uma vez;
2. gera no topo os structs dos schemas usados por todos os módulos, com os structs aninhados antes, cada `wgslName` uma
   vez;
3. valida os marcadores `{{struct:Nome}}` (o struct precisa vir de um schema declarado) e os remove;
4. confere que toda chamada de função é resolvida (builtin do WGSL ou símbolo de algum módulo).

O resultado é memorizado por módulo de entrada: a mesma entrada devolve a mesma spec, e o `EngineCore` deduplica pelo
hash — estágios que usam o mesmo módulo compartilham o objeto de GPU. Nada disso roda por quadro.

Quem consome:

- `PipelineDescriptor.shader: WgslModule` (render e compute);
- `createComputeKernel(core, { discriminator, shader, entryPoint, bindings | bindGroups })`;
- efeitos de pós: `PostProcessEffect.fragmentModule?(): WgslModule` (sobre o módulo `effectsBase`).

### Erros de montagem

`WgslCompositionError` traz `kind` e uma mensagem com os módulos envolvidos:

| `kind`                  | Causa                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| `cycle`                 | `requires` forma um ciclo (a mensagem mostra o caminho `a → b → a`)             |
| `duplicate-module-name` | dois módulos distintos com o mesmo `name` na mesma montagem                     |
| `symbol-conflict`       | o mesmo símbolo definido por dois módulos (ou por um módulo e um struct gerado) |
| `struct-marker`         | `{{struct:Nome}}` sem schema correspondente em `structs`                        |
| `struct-conflict`       | dois schemas diferentes com o mesmo `wgslName`                                  |
| `unresolved-reference`  | chamada a função que nenhum módulo define                                       |

## Structs gerados

O `StructSchema` é a única declaração de um struct de GPU: o layout em TypeScript (`offsetOf`, `stride`, `pack`,
`packInto`) e o struct WGSL (`toWGSL()`) saem da mesma definição.

```ts
const TerrainParams = new StructSchema(
    'TerrainParams',
    {
        origin: FieldType.vec3f,
        scale: FieldType.f32,
        octaves: FieldType.u32,
        weights: fieldArray(FieldType.f32, 8),
    },
    { addressSpace: 'uniform' },           // regras de uniform (std140); padrão 'storage' (std430)
);
```

- `wgslName`: nome do struct no WGSL quando difere do nome do schema (o nome do schema continua sendo a chave do pool).
- `addressSpace: 'uniform'` aplica os arredondamentos de uniform e proíbe atômicos e arrays em execução.
- Compostos: `fieldArray(elem, n)`, `fieldStruct(schema)` (aninhado; entra em `dependencies`), `fieldRuntimeArray(elem)`
  (último campo, só storage). Atômicos: `FieldType.atomicU32`, `FieldType.atomicI32`.
- Parâmetros mudando várias vezes no mesmo quadro: `core.write` entra na fila antes do quadro inteiro, então cada
  chamada precisa da sua região de uniform (offset dinâmico) — é o que `PerStepUniforms` (física) e `FrameUniforms`
  (kernels genéricos) fazem.

O gate proíbe offsets numéricos à mão em TypeScript, e o smoke `shaderLibrary` grava sentinelas campo a campo na GPU e
confere cada `offsetOf` dos schemas do motor.

## Biblioteca `wgslLib`

| Módulo        | Conteúdo                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `quat`        | produto, rotação de vetor (e inversa), normalização, integração, Δ de velocidade angular                    |
| `linalg`      | `mat3_det`, `mat3_inverse`, `mat3_transpose`, `mat3_mul`, `mat3_frobenius_norm`                              |
| `mat`         | matrizes de quaternion/colunas, TRS, inversa rígida, `polar_decomp_quaternion` (iterativa, partida a quente) |
| `sdf`         | esfera, caixa, plano, avaliação e gradiente                                                                  |
| `sphKernels`  | `W_cubic`, `grad_W_cubic`, `laplacian_W_visc`, `W_poly6`, `grad_W_spiky`                                     |
| `mpmWeights`  | pesos B-spline quadráticos e gradientes                                                                      |
| `xpbd`        | Δλ com compliance, massa generalizada de corpo rígido                                                        |
| `lcp`         | Delassus, viés, passos PGS (normal e atrito), `coulomb_clamp`, `combine_mu`                                  |
| `fem`         | `compute_Ds`, `compute_F`, `compute_J`, gradientes hidrostático/desviador, Δλ                                |
| `noise`       | `pcg_hash`, `hash2/3`, ruído de valor e de gradiente 2D/3D                                                   |
| `color`       | `tonemap_exposure`, `gamma_encode`, `luminance` (BT.601)                                                     |
| `brdf`        | `lambert_diffuse`, `lambert_lit`, `sample_shadow_pcf`                                                        |
| `fixedPoint`  | `fixed_from_f32`, `fixed_to_f32`, `fixed_saturated` — somas atômicas de valores reais                        |
| `atomicAlloc` | `atomic_alloc` e `ATOMIC_ALLOC_FULL` — posição numa lista compactada, com excedente contado                  |

Cada função existe em um único módulo (o gate falha se um `fn`/`struct`/`const` aparece em dois `.wgsl`), e todo
`.wgsl` é fonte de exatamente um módulo (sem órfãos). O smoke `shaderLibrary` compara valores de cada módulo na GPU com
referências em CPU.

## Kernels genéricos

Em `elements` (C3), para os estágios do motor e para quem escreve um algoritmo novo (nível N3). Todos alocam pela
capacidade e trabalham em duas fases: `prepare(...)` — fora da gravação (no construtor ou numa transição do Flow) —
cria os kernels para os buffers do chamador e reserva as regiões de parâmetros de até `recordsPerFrame` gravações;
`record(frame, …)` só grava (nenhuma criação no `dispatch`). Não despacham com contagem 0; o despacho linear cobre mais
de 65 535 grupos. Os bindings internos usam `createComputeKernel` com fontes pelo nome da variável WGSL.

```ts
const scan = new PrefixSum(core, { discriminator: 'cells', capacity: cellCount });
scan.prepare(starts);                                                            // fora da gravação
scan.record(frame, { src: counts, dst: starts, count: cellCount });              // exclusiva; `mode: 'inclusive'`

const sort = new RadixSort(core, { discriminator: 'keys', capacity: n, withValues: true });
sort.prepare(keys, values);
sort.record(frame, { keys, values, count: n, bits: 16 });                        // estável, no lugar

const reduce = new Reduce(core, { discriminator: 'maxSpeed', capacity: n, op: 'max', type: 'f32' });
reduce.prepare(speeds, stats);
reduce.record(frame, { src: speeds, count: n, out: stats, outOffset: 0 });
```

- **`PrefixSum`** — u32, exclusiva ou inclusiva, em vários níveis; `src` preservado quando difere de `dst`.
- **`RadixSort`** — LSD estável de 4 bits por passe, chaves u32 com valores opcionais; termina no buffer do chamador.
- **`Compaction`** — lista densa dos `i` aceitos por um predicado do consumidor (módulo com
  `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32`, buffers no `@group(1)`); modo atômico (ordem
  não garantida) ou `stable` (ordem da entrada); contador `AtomicAllocCounter` com aceitos e excedente.
- **`Reduce`** — sum/min/max × u32/i32/f32; soma de f32 com tolerância relativa `1e-5 × log2(N)` em relação à soma
  sequencial.
- **`GraphColorer`** — coloração de arestas na GPU (arestas da mesma cor não compartilham vértice), ≤ 2Δ − 1 cores,
  com as arestas agrupadas por cor e os intervalos `{ offset, count }`. Assíncrona e com envios próprios: chamada na
  criação ou mudança de topologia, fora de um quadro.

O smoke `computeKernels` valida todos contra a CPU (inclusive 4 M elementos) e registra os tempos.

## Bindings: layout inferido e `consumes` (spec 006)

O layout de um pipeline vem do WGSL montado: `LayoutInferencer.infer(shader, entryPoints)` devolve os grupos e
bindings que as entradas usam, o tipo de cada recurso e a visibilidade (a união dos estágios das entradas que
alcançam a variável, inclusive por funções auxiliares). Num Flow, a C2 liga cada binding a uma fonte — privado do Flow
pelo nome (`pipeline:variável`, depois `variável`) ou o nome de `consumes` cujo tipo é o do binding (o
`ConsumerResolver` desse nome devolve o buffer, a view ou o sampler) — e cria os bind groups; ver [Flows](./flows.md).
Uma entrada de `consumes` pode renomear o tipo lido: `{ name: WireframeMaterial.schema.name, as: 'StandardMaterial' }`
liga o pool `WireframeMaterial` a um binding declarado como `StandardMaterial`.

## Pontos de extensão (spec 009)

O usuário escreve a matemática de um estágio numa função WGSL de assinatura fixa, anexada como Resource; o motor
compõe a função no lugar da implementação pronta, valida na criação e confere a compilação antes de usar. `time` é o
tempo simulado (s); `data` é o struct dos parâmetros declarados em `params` (alias do ponto, ex. `TransformFnParams`).

| Ponto       | Função                                                                                   | Opcionais                                   | Onde                       | Pronta                              |
| ----------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------- | ----------------------------------- |
| `transform` | `transform_fn(slot: u32, t: Transform, data, time: f32) -> mat4x4f`                       | —                                           | entidade                   | TRS (`transform_local`)             |
| `camera`    | `camera_fn(c: Camera, world: mat4x4f, aspect: f32, data, time: f32) -> CameraOut`         | `camera_project(view_pos: vec3f, data) -> vec4f` | câmera                | perspectiva/ortográfica             |
| `surface`   | `surface_fn(u: f32, v: f32, time: f32, data) -> vec3f`                                    | `surface_du`, `surface_dv`; `surface_duu`, `surface_duv`, `surface_dvv` (spec 010) | `ParametricSurface`        | plano, esfera, toro, terreno        |
| `space`     | `space_fn(x: vec3f, time: f32, data) -> vec3f`                                            | `space_jacobian(x, time, data) -> mat3x3f`  | cena (superfícies)         | identidade                          |
| `field`     | `field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data) -> vec3f`                 | —                                           | cena (todos os solvers)    | gravidade pontual, vento, vórtice, arrasto, empuxo |
| `material`  | `material_fn(s: SurfaceSample, m: StandardMaterial, data) -> SurfaceParams`               | —                                           | entidade (`StandardMaterial`) | as constantes do material        |
| `emit`      | `emit_fn(i: u32, time: f32, seed: u32, data) -> EmittedParticle`                          | —                                           | `ComputeParticleEmitter`   | ponto, esfera, cone                 |

```ts
const orbit = new TransformFunction({
    params: { radius: 'f32', period: 'f32' },
    values: { radius: 2, period: 4 },
    code: /* wgsl */ `
fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    let a = 6.2831853 * time / data.period + f32(slot) * 0.01;
    var m = transform_local(t).world;
    m[3] = vec4f(data.radius * cos(a), t.position.y, data.radius * sin(a), 1.0);
    return m;
}`,
});
app.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()).add(orbit));
orbit.values.radius = 3; // quadro seguinte, sem recompilar
orbit.setCode(outroCodigo); // vale quando compilar; erro → extensionRejected, a anterior continua
app.events.on('extensionRejected', (e) => console.warn(e.point, e.line, e.message));
```

- **Erros.** Assinatura errada, símbolo do núcleo redefinido ou chamada sem definição: exceção na criação, com o
  ponto e as assinaturas esperada e recebida. Erro de compilação: `extensionRejected` com a linha do código do
  usuário; a cena continua com a função anterior (ou com a pronta).
- **Não finito.** Matriz, partícula, ponto ou campo infinitos são descartados (mantém o anterior / não nasce / soma
  zero). NaN depende da GPU: compiladores com matemática rápida podem não preservá-lo.
- **Custos.** Um pipeline por código (não por entidade): entidades com o mesmo código formam um grupo. Funções de
  cena recompilam os estágios que as usam uma vez por mudança.
- **Uma instância por entidade** (reuso de instância é proibido); `values` diferentes por entidade.
- **Laços sem fim** travam a GPU como em qualquer shader: o motor não os interrompe.

## Superfícies: geometria diferencial e malha adaptativa (spec 010)

`new ParametricSurface({ differential: true })` grava, por vértice, a primeira forma (E, F, G), a segunda (L, M, N),
as curvaturas gaussiana, média e principais (sinal convexo positivo: esfera com a normal para fora tem H = 1/r) e a
direção principal de k₁. O material as recebe no `SurfaceSample`:

```wgsl
struct SurfaceSample {
    world_position: vec3f, normal: vec3f, uv: vec2f, time: f32,
    metric: vec3f,     // E, F, G
    curvature: vec4f,  // K, H, k1, k2
    principal: vec3f,  // direção de k1 (mundo); 0 em umbílicos
}
```

As derivadas vêm, nesta ordem: do mapa composto com o espaço da cena (com `SpaceFunction`), das cinco derivadas
analíticas da função (`surface_du` … `surface_dvv`), das prontas (plano, esfera e toro analíticos), ou de diferenças
centrais. Em geometrias sem os dados (outras malhas), os campos são zero.

`adaptive: { patches, maxLevel, budget, tolerance, screen, periodic, refreshDistance }` troca a grade uniforme por uma
malha refinada por retalho — mais triângulos onde a superfície curva mais (erro de corda abaixo de `tolerance`) e onde
ocupa mais da tela (`screen` = fração da altura da imagem por segmento), com teto `budget` — sem frestas entre níveis,
gerada e contada na GPU e desenhada com desenho indireto. É refeita quando a superfície muda ou anima, ou quando a
câmera anda mais que `refreshDistance`. Sem `indirect-first-instance` no device, fica no nível máximo (evento
`adaptiveUnavailable`).

## Fora desta versão

- Espaço aplicado à cena inteira (malhas, luz, sombra) e portais: spec 019.
- Cook-Torrance com a rugosidade e a metalicidade da função `material`, texturas por mapa: specs 011 e 012.
- Módulos `procedural` e `sampling` da biblioteca: fases posteriores do roadmap.
