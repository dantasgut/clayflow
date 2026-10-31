---
sidebar_position: 13
title: Shaders — módulos WGSL e kernels genéricos
---

# Shaders — módulos WGSL e kernels genéricos

Todo shader do motor é montado a partir de **módulos WGSL** com dependências declaradas. Não há concatenação de texto,
cópia de função entre arquivos, struct escrito à mão nem ligação escrita à mão: a matemática vive numa biblioteca
(`wgslLib`), os structs são gerados dos `StructSchema`, os recursos de GPU são declarados (`wgslResource`) e ligados
pelo motor, as constantes compartilhadas com o TypeScript têm fonte única (`sharedConstant`) e os algoritmos paralelos
comuns (soma de prefixos, ordenação, compactação, redução, coloração de grafo) são kernels prontos.

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
escopo de módulo): símbolo definido duas vezes no mesmo módulo é erro imediato, e `@group`/`@binding` escritos no fonte
também (`manual-binding`) — recursos são declarados (ver "Recursos declarados").

No motor, só os arquivos de módulo (`shaders.ts` de cada pacote, `elements/gpu/shaders/`, `elements/gpu/compute/`)
importam `.wgsl` — o gate verifica.

## Montagem

`composeWgsl(entrada)` produz a `ShaderModuleSpec` do shader:

1. resolve `requires` em ordem topológica (dependências antes, irmãos na ordem declarada) e inclui cada módulo uma vez;
2. gera no topo os structs dos schemas usados por todos os módulos, com os structs aninhados antes, cada `wgslName` uma
   vez;
3. emite as linhas `@group(g) @binding(b) var…` dos recursos declarados alcançados, com grupo e ligação atribuídos
   pelo motor;
4. valida os marcadores `{{struct:Nome}}` (o struct precisa vir de um schema declarado) e os remove;
5. confere que toda chamada de função é resolvida (builtin do WGSL ou símbolo de algum módulo) e que nenhum módulo usa
   um recurso declarado que não alcança pelos seus `requires` (global implícito do hospedeiro).

O resultado é memorizado por módulo de entrada: a mesma entrada devolve a mesma spec, e o `EngineCore` deduplica pelo
hash — estágios que usam o mesmo módulo compartilham o objeto de GPU. Nada disso roda por quadro.

Quem consome:

- `PipelineDescriptor.shader: WgslModule` (render e compute);
- `createComputeKernel(core, { discriminator, shader, entryPoint, bindings, constants? })` — `bindings` é um
  `Map<BindingKey, BindingSource>` pela identidade do recurso;
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
| `unresolved-reference`  | chamada a função que nenhum módulo define, ou recurso usado sem estar em `requires` |
| `manual-binding`        | `@group`/`@binding` escrito no fonte de um módulo                               |
| `limit-exceeded`        | layout acima de um limite do device (conferido na preparação do pipeline)       |

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

| Módulo            | Conteúdo                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `constants`       | `PI`, `TAU`, `INV_PI` (spec 037)                                                                             |
| `random`          | `pcg_hash`, `hash2`, `hash3`, `hash_signed` (bit a bit), `random_next`, `random_unit` em [0, 1) (spec 037)   |
| `hashAddress`     | `hash_cell` (Teschner), `hash_knuth` — endereçamento de tabelas, sem a redução (spec 037)                    |
| `color`           | `luminance` (Rec.709, luz linear), `max_channel`, `ycocg`/`ycocg_inverse`, `srgb_encode`/`srgb_encode_extended`/`srgb_decode`, `grade_gamma`, `unpack_half_rgb` |
| `basis`           | `basis_duff`, `basis_cross(n, eixo auxiliar)` (spec 037)                                                     |
| `sampling`        | `sample_cosine`, `sample_sphere`, `sample_cone`, `sample_triangle` (spec 037)                                |
| `xformRigid`      | `rigid_compose`, `rigid_inverse`, `rigid_rotation_inverse`, `rigid_point`, `rigid_direction` (spec 037)      |
| `xformAffine`     | `affine_compose`, `affine_inverse` (singular → identidade), `affine_point`, `affine_direction`, `affine_normal`, `affine_normal_of_inverse` |
| `xformProjective` | `projective_inverse`, `projective_point` (spec 037)                                                          |
| `xformTrs`        | `trs_world` (T·R·S), `trs_normal` (R·S⁻¹) (spec 037)                                                         |
| `viewSpace`       | `ndc_to_uv`, `uv_to_ndc`, `pixel_to_ndc`, `clip_divide`, `is_orthographic`, `view_depth`, `motion_from_clips` (spec 037) |
| `temporal`        | peças dos acumuladores: `temporal_reproject_point`, `temporal_cut`, `temporal_validate_object`/`_plane`, `temporal_weight_count`/`_change`, `temporal_hysteresis`, `temporal_moments`, `temporal_variance`, `temporal_mean_variance` (spec 037) |
| `quat`            | produto, rotação de vetor (e inversa), normalização, integração, Δ de velocidade angular                    |
| `linalg`          | `mat3_det`, `mat3_inverse`, `mat3_adjugate`, `mat3_transpose`, `mat3_mul`, `mat3_frobenius_norm`             |
| `mat`             | matrizes de quaternion/colunas, `polar_decomp_quaternion` (iterativa, partida a quente)                      |
| `sdf`             | esfera, caixa, plano, avaliação e gradiente                                                                  |
| `sphKernels`      | `W_cubic`, `grad_W_cubic`, `laplacian_W_visc`, `W_poly6`, `grad_W_spiky`                                     |
| `mpmWeights`      | pesos B-spline quadráticos e gradientes                                                                      |
| `xpbd`            | Δλ com compliance, massa generalizada de corpo rígido                                                        |
| `lcp`             | Delassus, viés, passos PGS (normal e atrito), `coulomb_clamp`, `combine_mu`                                  |
| `fem`             | `compute_Ds`, `compute_F`, `compute_J`, gradientes hidrostático/desviador, Δλ                                |
| `noise`           | ruído de valor e de gradiente 2D/3D (e as variantes por célula `*_cell`, base dos nós `noise.*` com semente) |
| `brdf`            | `lambert_diffuse`, `lambert_lit`, `sample_shadow_pcf`                                                        |
| `fixedPoint`      | `fixed_from_f32`, `fixed_to_f32`, `fixed_saturated` — somas atômicas de valores reais                        |
| `atomicAlloc`     | `atomic_alloc` e `ATOMIC_ALLOC_FULL` — posição numa lista compactada, com excedente contado                  |
| `camera`          | `camera_perspective`, `camera_orthographic`, `camera_projection`, `camera_shift`, `camera_view`, `camera_look_at`, `camera_orthographic_box` |
| `finite`          | `finite3`, `finite4`, `finite_mat4` — o teste único de não finitos das saídas de funções e grafos          |
| `poolLive`        | `pool_live(word, slot)` — teste do bitset de slots vivos de um pool                                          |

Cada função existe em um único módulo (o gate falha se um `fn`/`struct`/`const` aparece em dois `.wgsl`), e todo
`.wgsl` é fonte de exatamente um módulo (sem órfãos). O smoke `shaderLibrary` compara valores de cada módulo na GPU com
referências em CPU.

## Matemática canônica (spec 037)

Cada conta tem uma definição; o nome diz a classe ou o domínio. As transformações têm a mesma lista de operações em
cada classe — `rigid_*` (rotação + translação), `affine_*` (3×3 + translação), `projective_*` (4×4), `trs_*` —, e quem
escreve o kernel escolhe a classe pelo nome: nunca há ramo por classe em execução. Nos nós de grafo, a classe é o nó
(`space.inverse` afim, `space.inverseRigid`, `space.inverseProjective`). A referência f64 única está em
`elements/math/reference` (`xform`, `random`, `color`, `temporal`); o smoke `shaderLibrary` compara a GPU com ela
(rígida e TRS até 4 ulp).

Dados já calculados, para ler em vez de recalcular:

- `cameras[slot].inverseView`, `.inverseUnjitteredViewProjection`, `.previousView` (além de `view`, `projection`,
  `viewProjection`, `unjitteredViewProjection`, `previousViewProjection`, `jitter`, `history`) — o `CameraFlow` os
  calcula uma vez por quadro;
- `world_inverses[slot].inverse` (pool `WorldInverse`, recurso `worldInversesResource`): a inversa afim da matriz de
  mundo, sob demanda — quem lê pede o pool (`ResourceDirectory.ensurePoolAllocated('WorldInverse')`) numa transição, e
  o `TransformFlow` passa a escrevê-lo.

O módulo `cameraSpace` (de `elements/scene/flows/shaders`) junta o que lê a câmera: `camera_ray(slot, pixel, tamanho)`
(e `camera_ray_ndc`), `motion_vector(ponto anterior, ponto, slot)` e `pixel_footprint(slot, tamanho, ponto)`.

**Fluxos nomeados.** A semente de cada uso é `random_seed(RANDOM_STREAM_*, índice, quadro)`: refração, sondas do mundo,
sondas de tela (raios e luz), fótons, partículas difusas e froxels têm fluxos próprios (efeitos diferentes no mesmo
pixel não tiram os mesmos números); uma extensão usa `RANDOM_STREAM_USER + n`.

**Aleatoriedade e endereçamento são famílias separadas.** `random` dá números aleatórios (`pcg_hash` e companhia são
bit a bit: as sementes dos nós e a sequência dos emissores dependem deles); `hashAddress` leva chaves a baldes de
tabela (a ordem dos vizinhos da física depende dele). `random_unit` está em [0, 1) e nunca dá 1; `hash_signed` em [−1, 1]
fechado.

**Luminância é Rec.709 de luz linear** (`luminance`). Nos smokes, `support/images.ts` distingue a luma dos valores sRGB
de 8 bits (`lumaSrgb`) da luminância de luz linear (`luminanceLinear`).

A guarda `canonicalSignatures.test.ts` falha se uma assinatura numérica (multiplicadores do PCG, de Teschner e de
Knuth, pesos de luminância, curva sRGB, π e 2π literais, base de Duff, passagens NDC ↔ uv, inversa da rotação por
transposta) aparecer fora do módulo dono; a lista de pendências dela só encolhe.

### Migração

| Antes                                                                                  | Depois                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `diffuse_hash`, `ray_direct_hash`, `gi_hash`, `set_hash_unit`                          | `pcg_hash`, `random_unit`                         |
| `ray_direct_luminance`, `refraction_luminance`, `gi_luminance`, `node_color_luminance` | `luminance`                                       |
| `gamma_encode`                                                                         | `grade_gamma`                                     |
| `GI_PI`, `SKY_PI`, `BSDF_PI`, `FROXEL_PI`, `3.14159…`, `6.28318…`                      | `PI`, `TAU`                                       |
| `taa_ycocg`, `taa_rgb`                                                                 | `ycocg`, `ycocg_inverse`                          |
| `gi_unpack`, `gi_unpack_rgb`, `gi_unpack_generation`                                   | `unpack_half_rgb`                                 |
| `refraction_basis`, `gi_screen_basis`                                                  | `basis_duff`                                      |
| `rigid_mat4_inverse`                                                                   | `rigid_inverse`                                   |
| `ray_inverse_affine`, `node_space_inverse`                                             | `affine_inverse`                                  |
| `taa_inverse`                                                                          | `projective_inverse`                              |
| `ray_camera`                                                                           | `camera_ray` (`cameraSpace`)                      |
| `camera_motion`                                                                        | `motion_from_clips` (`viewSpace`)                 |
| `taa_view_depth`, `water_linear_depth`                                                 | `view_depth`                                      |
| `quat_to_mat4`, `mat4_upper3x3_transform`, `water_pixels_per_meter`                    | removidos (`trs_world` para o TRS)                |
| `TracedDenoiser`, `traced_denoise_*`, `defaults.denoiser`                              | `TemporalFilter`, `temporal_filter_*`, `defaults.renderer.temporalFilter` |

`transform_local(t)` continua à mão das funções `transform` (agora sobre `trs_world`/`trs_normal`); os nós mantêm os
nomes públicos.

## Kernels genéricos

Em `elements` (C3), para os estágios do motor e para quem escreve um algoritmo novo (nível N3). Todos alocam pela
capacidade e trabalham em duas fases: `prepare(...)` — fora da gravação (no construtor ou numa transição do Flow) —
cria os kernels para os buffers do chamador e reserva as regiões de parâmetros de até `recordsPerFrame` gravações;
`record(frame, …)` só grava (nenhuma criação no `dispatch`). Não despacham com contagem 0; o despacho linear cobre mais
de 65 535 grupos. Os bindings internos usam `createComputeKernel` com fontes pela identidade dos recursos
declarados.

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
  `fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32` que requer os recursos que lê; as fontes vão
  em `bindings`, pelo objeto do recurso); modo atômico (ordem não garantida) ou `stable` (ordem da entrada); contador
  `AtomicAllocCounter` com aceitos e excedente.
- **`Reduce`** — sum/min/max × u32/i32/f32; soma de f32 com tolerância relativa `1e-5 × log2(N)` em relação à soma
  sequencial.
- **`GraphColorer`** — coloração de arestas na GPU (arestas da mesma cor não compartilham vértice), ≤ 2Δ − 1 cores,
  com as arestas agrupadas por cor e os intervalos `{ offset, count }`. Assíncrona e com envios próprios: chamada na
  criação ou mudança de topologia, fora de um quadro.
- **`CountToArgs`** (spec 031) — um kernel de uma invocação que lê a contagem de um registro `SetCount` escrita na GPU
  e deriva no mesmo registro os argumentos de despacho e de desenho indiretos.

**Contagem da GPU (spec 031).** Preparados com `counts` (registros `SetCount`), `PrefixSum`, `RadixSort`,
`Compaction` e `Reduce` aceitam `count: { counts, index }` (`GpuCount`) no lugar de um número: a contagem é lida no
próprio kernel e os passes despacham pelo argumento indireto do registro (derivado antes por `CountToArgs` com
`workgroupSize: 256`) — nada volta à CPU. São os nós de conjunto `set.prefixSum`, `set.sort`, `set.compact` e
`set.reduce` (ver [Grafos de nós](./node-graphs.md)).

O smoke `computeKernels` valida todos contra a CPU (inclusive 4 M elementos) e registra os tempos.

## Recursos declarados e constantes (spec 031)

Um módulo não escreve `@group/@binding`. Cada recurso de GPU que ele usa — buffer de pool, uniform, textura,
amostrador — é um módulo `wgslResource` posto em `requires`, declarado uma vez e compartilhado por referência:

```ts
import { wgslResource, wgslModule, sharedConstant, WORKGROUP_SIZE } from 'clayflow';

export const terrainParams = wgslResource({
    name: 'terrain',                                   // nome da variável no WGSL
    binding: { uniform: true },                        // storage: 'read' | 'read_write', texture, storageTexture, sampler
    type: { schema: TerrainParams },                   // ou { wgsl: 'u32', array: true }
    frequency: 'stage',                                // frame | stage | batch | draw → grupo
    provider: 'private',                               // { pool } | { consumer } | { slot } | { scene } | 'private'
});
export const height = wgslModule({
    name: 'height',
    source: heightSource,                              // usa `terrain` e `WORKGROUP_SIZE`, sem declarar ligações
    requires: [wgslLib.noise, WORKGROUP_SIZE.module, terrainParams],
});
```

- **Grupo e ligação** são do motor: grupo = posto da frequência entre as presentes no shader (`frame` < `stage` <
  `batch` < `draw`), ligação = ordem do nome. Pipelines com os mesmos recursos `frame`/`stage` compartilham esses
  grupos.
- **Layout**: `LayoutInferencer.infer(shader, entryPoints)` lê só as declarações (`ComposedShader.bindings`) e deriva a
  visibilidade (a união dos estágios das entradas que alcançam a variável, inclusive por funções auxiliares).
- **Fonte** pelo fornecedor: `{ pool: chave }` e `{ consumer: nome }` pelos `ConsumerResolver` da cena; `{ slot }`
  pelo slot do Flow; `{ scene }` pelos pontos de cena; `'private'` pelo Flow (`bindings`/`ctx.bind`, num
  `Map<BindingKey, BindingSource>` cuja chave é o recurso ou `{ pipeline, resource }`) ou pelo chamador de
  `createComputeKernel`. Ver [Flows](./flows.md).
- **Gravação** sem índices: `prepared.bindTo(pass.bind, offsetsPorFrequência)` ou `prepared.groupsOf(frequência)`.
- **Limites do device** (grupos, ligações por grupo, storage/uniform/texturas/amostradores por estágio) conferidos na
  preparação: `limit-exceeded` nomeando o pipeline e o limite.
- **Constantes**: `sharedConstant(nome, valor, tipo)` dá o valor TS (`.value`) e um módulo `const` (`.module`) — fonte
  única para os dois lados (`NONE`, `WORKGROUP_SIZE`, `SCAN_GROUP`, `DEFAULT_LIGHT_DIRECTION`…). Variantes de um mesmo
  fonte usam `override` com `PipelineDescriptor.constants` / `createComputeKernel({ constants })`.
- **Instâncias**: o mesmo código duas vezes no shader (contribuintes de um ponto de cena) tem os símbolos renomeados
  por token (`instantiateModule`), nunca por substituição de texto.
- **Pontos de cena do sombreamento**: o desenho chama `scene_light_direction()`, `light_visibility(p, n_dot_l)` e
  `light_transmission(p, ambient, direct)`; a luz que projeta sombra e a água contribuem por
  `getSceneContributions()`, e a C2 compõe as contribuições presentes em todo pipeline que contém o ponto. Os sprites
  de corpos de partículas (`particle_sprite`) chamam `scene_any_light_direction()`: toda `DirectionalLight` e
  `PointLight` contribui, e a função lê na GPU a primeira luz viva do pool `Light` (bitset `Light.live`) — sem slot de
  luzes no estágio.

O detalhe está em [Arquitetura — Contrato de shader estruturado](./architecture_resource_loaders.md).

## Pontos de extensão (spec 009)

O usuário escreve a matemática de um estágio numa função WGSL de assinatura fixa — ou a monta como **grafo de nós**
(spec 031, [Grafos de nós](./node-graphs.md)) —, anexada como Resource; o motor compõe a função no lugar da
implementação pronta, valida na criação e confere a compilação antes de usar. `time` é o tempo simulado (s); `data` é
o struct dos parâmetros declarados em `params` (alias do ponto, ex. `TransformFnParams`).

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

- **Parâmetros tipados** (spec 031). `params` gera um registro por forma: o struct `<alias>_<hash>` com um campo por
  parâmetro no tipo declarado (`f32`, `u32`, `i32` e os vetores `vec2`–`vec4` de cada um) e `revision`, num pool por
  forma (`<ponto>:<hash>`) — sem teto de escalares e sem reinterpretação de bits. O módulo gerado traz o alias do
  ponto, o carregador `<função>_params(slot)` e o código; `revision` é nome reservado.
- **Por grafo.** `new MaterialFunction({ graph })` (e as outras seis) gera o código, os parâmetros (`nó_parâmetro`) e
  os módulos pelo grafo; `values['nó_parâmetro']` muda valores sem recompilar; `setGraph(outro)` troca a topologia
  (revisão +1, compila em transição, falha mantém o anterior); grafo sem saída usa a pronta (aviso único). `setCode`
  vale só para funções de código; `setGraph`, só para funções de grafo.
- **Erros.** Assinatura errada, símbolo do núcleo redefinido ou chamada sem definição: exceção na criação, com o
  ponto e as assinaturas esperada e recebida. Erro de compilação: `extensionRejected` com a linha do código do
  usuário; a cena continua com a função anterior (ou com a pronta).
- **Não finito.** Matriz, partícula, ponto ou campo infinitos são descartados (mantém o anterior / não nasce / soma
  zero). NaN depende da GPU: compiladores com matemática rápida podem não preservá-lo.
- **Custos.** Um pipeline por código (não por entidade): entidades com o mesmo código formam um grupo. Funções de
  cena recompilam os estágios que as usam uma vez por mudança. Um pipeline com funções cujos pools somados excedem um
  limite de storage do device é rejeitado (`extensionRejected`) e fica com a pronta.
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

## Pontos de cena (spec 033)

Os pontos de extensão acima são do usuário, um por entidade. Os **pontos de cena** são dos Resources do motor: cada
Resource contribui um módulo (`getSceneContributions()`), a C2 combina os contribuintes presentes pelo `combine` do
ponto e põe o resultado no lugar do pronto em todo pipeline que o requer. Um efeito novo entra sem mudar quem
consome; sem contribuinte, vale o pronto.

| Ponto | Assinatura | Combina | Contribuintes |
|---|---|---|---|
| `scene_lighting` | `fn scene_lighting(c: Closure, p: vec3f, n: vec3f, v: vec3f) -> vec3f` | soma | cada classe de luz, o hemisfério, a GI (indireta e cáusticas) |
| `light_visibility` | `fn light_visibility(light: u32, p: vec3f, n: vec3f) -> f32` | produto | os mapas de sombra (com viés pela normal) |
| `light_transmission` | `fn light_transmission(light: u32, p: vec3f) -> vec3f` | produto | o `Sky` (a cor do sol pela atmosfera), os `Froxels` (a névoa) |
| `scene_background` | `fn scene_background(dir: vec3f) -> vec3f` | soma | o `Sky` |
| `scene_environment` | `fn scene_environment(dir: vec3f) -> vec3f` | soma | o `Sky` (os raios que escapam) |
| `scene_fog` | `fn scene_fog(p: vec3f) -> vec4f` | em ordem (o de trás atenuado pelo da frente) | os `Froxels`: a luz espalhada (rgb) e a transmitância (a) entre a câmera e `p` |
| `scene_ambient` | `fn scene_ambient(p: vec3f) -> vec3f` | soma | o hemisfério ou a GI: a radiância média em `p` (a névoa lê) |
| `ray_volume_hit` | `fn ray_volume_hit(origin: vec3f, dir: vec3f, t_max: f32) -> RayVolumeHit` | o mais próximo | o `FluidField` (a água) |
| `ray_volume_transmittance` | `fn ray_volume_transmittance(origin: vec3f, dir: vec3f, t_max: f32) -> vec3f` | produto | o `FluidField`, os `Froxels` |

A densidade da névoa por função é um ponto de extensão do usuário (`fog_density`,
`density_fn(p: vec3f, time: f32, data) -> f32`, por `FogVolume`). A consulta da estrutura de raios
(`ray_scene_hit`, `ray_scene_occluded`) é um módulo comum: ver [Estrutura de raios](./raytracing.md).

## Fora desta versão

- Espaço aplicado à cena inteira (malhas, luz, sombra) e portais: spec 019.
- Cook-Torrance com a rugosidade e a metalicidade da função `material`, texturas por mapa: specs 011 e 012.
- Módulos `procedural` e `sampling` da biblioteca: fases posteriores do roadmap.
