# 10. Malha, Material e Transformação — Da Álgebra Linear à VRAM

Um objeto 3D renderizável é definido por três camadas ortogonais e complementares. Cada camada tem uma representação matemática abstrata e uma representação concreta na VRAM como objetos WebGPU. Entender como as duas se relacionam é o que separa escrever código que funciona de construir uma engine.

---

## Sistema de Coordenadas WebGPU

Antes de qualquer dado chegar à GPU, é preciso entender o espaço onde ele vai existir.

> **WebGPU adota NDC Left-Handed (Mão Esquerda)**
> - Eixo **X (+)** → Direita
> - Eixo **Y (+)** → Cima
> - Eixo **Z (+)** → Fundo da tela (afastando do observador), intervalo **[0.0, 1.0]**
>
> Diferente do OpenGL (Right-Handed, Z de -1 a 1) e do Vulkan (Y invertido). Toda matriz de projeção deve ser construída respeitando esse espaço.

As coordenadas de framebuffer (pixels) têm origem no **canto superior esquerdo**, com Y crescendo para baixo. Coordenadas de textura (UV) têm origem no **canto superior esquerdo** também, com V crescendo para baixo.

---

## Camada 1 — Malha (Mesh)

A malha é a geometria pura: a coleção de pontos no espaço e como eles se conectam em triângulos. É tudo aquilo que define a **forma** do objeto, sem cor ou posição no mundo.

### 1.1 O Vértice como Estrutura de Dados

A GPU não processa um vértice como um ponto isolado. Ela processa um **registro de atributos** — um pacote de vetores que viaja junto pelo pipeline.

Um vértice completo carrega:

| Atributo | Tipo WGSL | Bytes | Descrição |
|---|---|---|---|
| `position` | `vec3<f32>` | 12 | Coordenada local do vértice `(x, y, z)` |
| `normal` | `vec3<f32>` | 12 | Vetor perpendicular à superfície (normalizado) |
| `tangent` | `vec4<f32>` | 16 | Direção UV horizontal + `w` = handedness (±1) |
| `uv` | `vec2<f32>` | 8 | Coordenadas de textura `(u, v)` ∈ [0, 1] |
| `color` | `vec4<f32>` | 16 | Cor por vértice (opcional) |

**Total típico:** 64 bytes por vértice (número conveniente para alinhamento).

### 1.2 Vetores e Magnitude

O vetor de posição $\vec{v} = (x, y, z)$ é uma flecha que emana da origem `(0,0,0)` até a coordenada alvo. Sua **magnitude** (comprimento) é:

$$||\vec{v}|| = \sqrt{x^2 + y^2 + z^2}$$

Um vetor com magnitude 1.0 é chamado **normalizado** (unit vector). Normais e tangentes devem sempre estar normalizadas — o hardware as usa em produtos escalares cujo resultado depende diretamente do comprimento.

$$\hat{v} = \frac{\vec{v}}{||\vec{v}||}$$

### 1.3 Armazenamento na VRAM: Vertex Buffer

Os atributos do vértice vivem num `GPUBuffer` com flag `VERTEX`. O layout de memória pode ser:

**Interleaved (recomendado):** todos os atributos do mesmo vértice contíguos na memória. Melhor para o cache da GPU — um único fetch traz o vértice inteiro.

```
[ pos(12) | normal(12) | tangent(16) | uv(8) ][ pos(12) | normal(12) | ... ]
  ←────────────── stride: 48 bytes ──────────→
```

**Separado (separate streams):** cada atributo em buffer próprio. Flexível para atualizar apenas posições (animação) sem reenviar normais e UVs.

```javascript
// Buffer interleaved: posição + normal + uv
const vertexBuffer = device.createBuffer({
  label: 'Mesh::VertexBuffer',
  size: vertexCount * 48, // stride de 48 bytes por vértice
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
});

// Declaração no pipeline: como o Input Assembler lê esse buffer
const vertexBufferLayout = {
  arrayStride: 48,           // bytes entre o início de um vértice e o próximo
  stepMode: 'vertex',        // avança por vértice (vs 'instance' para per-instance data)
  attributes: [
    { shaderLocation: 0, offset:  0, format: 'float32x3' }, // position
    { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
    { shaderLocation: 2, offset: 24, format: 'float32x4' }, // tangent
    { shaderLocation: 3, offset: 40, format: 'float32x2' }, // uv
  ]
};
```

No WGSL o vértice é recebido assim:

```wgsl
struct VertexInput {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) tangent  : vec4<f32>,
  @location(3) uv       : vec2<f32>,
}
```

### 1.4 Index Buffer e Eliminação de Duplicatas

Triângulos compartilham vértices. Sem indexação, um cubo (12 triângulos) precisaria de 36 vértices; com índices, precisaria de apenas 8 — uma redução de 78% de dados na VRAM.

```
Sem índices:  v0 v1 v2 | v2 v1 v3 | ...   (36 vértices para um cubo)
Com índices:  [v0..v7]  +  [0,1,2, 2,1,3, ...]  (8 + 36 uint16)
```

```javascript
const indexBuffer = device.createBuffer({
  label: 'Mesh::IndexBuffer',
  size: indices.byteLength,
  usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
});

// No render pass:
renderPass.setIndexBuffer(indexBuffer, 'uint16'); // ou 'uint32' para > 65535 vértices
renderPass.drawIndexed(indexCount);
```

Usar `uint16` quando `vertexCount < 65536` — ocupa metade da VRAM que `uint32`.

### 1.5 Topologias

A topologia define como os índices se agrupam em primitivos:

| `GPUPrimitiveTopology` | Descrição | Uso |
|---|---|---|
| `triangle-list` | Cada 3 índices = 1 triângulo | Padrão para malhas |
| `triangle-strip` | Cada índice = novo triângulo com os 2 anteriores | Terrenos, quads |
| `line-list` | Cada 2 índices = 1 linha | Debug, wireframe |
| `point-list` | Cada índice = 1 ponto | Partículas, pontos de controle |

---

## Camada 2 — Material

O material responde à pergunta: **como a luz interage com a superfície?** Para a GPU, um material é um conjunto de recursos (texturas, samplers, constantes) organizados num `GPUBindGroup` e consumidos pelo fragment shader.

### 2.1 UV Mapping — Projeção Planar sobre Superfície Curva

Cada vértice carrega coordenadas `(u, v)` no intervalo [0.0, 1.0] que mapeiam sua posição sobre uma textura 2D. O rasterizador **interpola** esses valores entre os vértices, de modo que cada fragmento (pixel coberto) recebe suas próprias coordenadas UV calculadas automaticamente.

```
Vértice A: uv(0.0, 0.0)  ←── interpolado ──→  Vértice B: uv(1.0, 0.0)
                                  ↓
                    Fragmento no meio: uv(0.5, 0.0)
                    GPU chama textureSample(tex, sampler, vec2f(0.5, 0.0))
```

O `GPUSampler` governa o que acontece **fora** de [0,1] (`addressMode`) e como a textura é filtrada ao ser ampliada/reduzida (`magFilter`/`minFilter`/`mipmapFilter`).

### 2.2 Mapas PBR e seus Papéis

Um material Physically Based Rendering (PBR) usa múltiplas texturas, cada uma codificando um aspecto físico diferente da superfície:

| Mapa | Canais usados | O que codifica |
|---|---|---|
| **Albedo** (Base Color) | RGB + A | Cor difusa sem iluminação; alpha = transparência |
| **Normal Map** | RGB | Vetores de normal em espaço tangente (roxo/verde/ciano) |
| **Metallic** | R | 0 = dielétrico (plástico), 1 = metálico |
| **Roughness** | G | 0 = espelho perfeito, 1 = completamente difuso |
| **Occlusion** | R | Oclusão ambiental pré-calculada (sombra de cavidades) |
| **Emissive** | RGB | Cor emitida independentemente de iluminação |

Na VRAM, metallic e roughness frequentemente residem no mesmo `GPUTexture` em canais separados (G e B, respectivamente) para economizar uma unidade de textura e memória de bandwidth.

### 2.3 Armazenamento na VRAM: BindGroup de Material

O material vive no **grupo 1** por convenção (grupo 0 reservado para dados globais de câmera/cena):

```javascript
const materialBindGroup = device.createBindGroup({
  label: 'Material::Wood',
  layout: pipeline.getBindGroupLayout(1),
  entries: [
    { binding: 0, resource: albedoTexture.createView() },
    { binding: 1, resource: normalMapTexture.createView() },
    { binding: 2, resource: metallicRoughnessTexture.createView() },
    { binding: 3, resource: linearSampler },        // filtro bilinear
    { binding: 4, resource: { buffer: materialUBO } } // constantes: tiling, emissive factor...
  ]
});
```

```wgsl
@group(1) @binding(0) var albedoMap    : texture_2d<f32>;
@group(1) @binding(1) var normalMap    : texture_2d<f32>;
@group(1) @binding(2) var mrMap        : texture_2d<f32>; // metallic(R) roughness(G)
@group(1) @binding(3) var linearSampler: sampler;
@group(1) @binding(4) var<uniform> mat : MaterialUniforms;
```

### 2.4 Normal Mapping — Espaço Tangente e Matriz TBN

A normal do vértice aponta perpendicularmente à superfície no **espaço do objeto**. Já o normal map armazena vetores no **espaço tangente** — um sistema de coordenadas local a cada triângulo onde Z sempre aponta para fora da face. Precisamos de uma matriz de conversão entre os dois espaços: a **Matriz TBN**.

**Construção da TBN:**

Dado um triângulo com vértices $V_0, V_1, V_2$ e suas UVs correspondentes:

$$\Delta \vec{E_1} = V_1 - V_0, \quad \Delta \vec{E_2} = V_2 - V_0$$
$$\Delta UV_1 = (u_1 - u_0,\ v_1 - v_0), \quad \Delta UV_2 = (u_2 - u_0,\ v_2 - v_0)$$

A tangente $\vec{T}$ e bitangente $\vec{B}$ são extraídas resolvendo o sistema:

$$\begin{bmatrix} \vec{T} \\ \vec{B} \end{bmatrix} = \frac{1}{\Delta u_1 \Delta v_2 - \Delta u_2 \Delta v_1} \begin{bmatrix} \Delta v_2 & -\Delta v_1 \\ -\Delta u_2 & \Delta u_1 \end{bmatrix} \begin{bmatrix} \Delta \vec{E_1} \\ \Delta \vec{E_2} \end{bmatrix}$$

Na prática, tangentes são pré-calculadas na CPU (ferramentas como MikkTSpace) e armazenadas como atributo `vec4<f32>` — o componente `w` guarda o **handedness** (±1), que determina se a bitangente deve ser invertida.

No vertex shader, a matriz TBN é montada e passada ao fragment shader:

```wgsl
// Vertex shader — constrói TBN no world space
let N = normalize((model.matrix * vec4f(in.normal,   0.0)).xyz);
let T = normalize((model.matrix * vec4f(in.tangent.xyz, 0.0)).xyz);
let B = cross(N, T) * in.tangent.w; // w = handedness (±1)

out.TBN = mat3x3<f32>(T, B, N); // colunas = eixos do espaço tangente
```

```wgsl
// Fragment shader — converte normal do mapa para world space
let normalSample = textureSample(normalMap, linearSampler, in.uv).xyz;
let tangentNormal = normalSample * 2.0 - 1.0; // [0,1] → [-1,1]
let worldNormal   = normalize(in.TBN * tangentNormal);
```

**Produto Vetorial (Cross Product)** gera a bitangente ortogonal:

$$\vec{B} = \vec{N} \times \vec{T}$$

O resultado é um vetor perpendicular ao plano formado por $\vec{N}$ e $\vec{T}$, completando o sistema de três eixos ortogonais do espaço tangente.

**Produto Escalar (Dot Product)** calcula a intensidade da luz:

$$I_{Lambert} = \max(\hat{N}_{world} \cdot \hat{L}, \ 0.0)$$

Onde $\hat{L}$ é a direção normalizada da luz. O `max` descarta faces voltadas para longe da luz (produto negativo = superfície em sombra).

$$P_{final} = C_{albedo} \cdot I_{Lambert}$$

---

## Camada 3 — Transformações

A malha existe em **espaço local** — centrada em `(0,0,0)` com orientação canônica. Para posicioná-la no mundo, movê-la e projetá-la na tela, aplica-se uma cadeia de três transformações matriciais.

### 3.1 Os Quatro Espaços

```
Local Space  →[M]→  World Space  →[V]→  View Space  →[P]→  Clip Space  →÷w→  NDC
(objeto)             (cena)              (câmera)            (projeção)        (tela)
```

| Espaço | Descrição |
|---|---|
| **Local** | Coordenadas originais do modelo, centradas na origem |
| **World** | Posição e orientação do objeto no mundo compartilhado |
| **View** | O mundo visto da perspectiva da câmera (câmera na origem, olhando -Z) |
| **Clip** | Após projeção perspectiva; w ≠ 1; GPU executa divisão por w |
| **NDC** | Cubo normalizado [-1,1]×[-1,1]×[0,1]; rasterização acontece aqui |

### 3.2 As Três Matrizes

A equação executada pelo vertex shader para cada vértice é:

$$P_{clip} = M_{proj} \cdot M_{view} \cdot M_{model} \cdot \vec{v}_{local}$$

**Matriz Modelo $M_{model}$ (Local → World):**

Composta por três transformações fundamentais aplicadas da direita para a esquerda:

$$M_{model} = M_{translate} \cdot M_{rotate} \cdot M_{scale}$$

Cada uma é uma matriz 4×4. A quarta dimensão (coordenada homogênea `w=1`) é o que permite que translação seja representada como multiplicação matricial — sem ela, translação exigiria adição, quebrando a composição.

$$M_{scale} = \begin{bmatrix} s_x & 0 & 0 & 0 \\ 0 & s_y & 0 & 0 \\ 0 & 0 & s_z & 0 \\ 0 & 0 & 0 & 1 \end{bmatrix}, \quad M_{translate} = \begin{bmatrix} 1 & 0 & 0 & t_x \\ 0 & 1 & 0 & t_y \\ 0 & 0 & 1 & t_z \\ 0 & 0 & 0 & 1 \end{bmatrix}$$

**Matriz View $M_{view}$ (World → View):**

Não movemos a câmera — movemos o mundo inteiro na direção oposta. Se a câmera está em $\vec{eye}$ olhando para $\vec{target}$:

$$M_{view} = \text{lookAt}(\vec{eye}, \vec{target}, \vec{up})$$

Internamente, três vetores definem o frame da câmera:

$$\vec{f} = \text{normalize}(\vec{target} - \vec{eye}), \quad \vec{r} = \text{normalize}(\vec{f} \times \vec{up}), \quad \vec{u} = \vec{r} \times \vec{f}$$

$$M_{view} = \begin{bmatrix} r_x & r_y & r_z & -\vec{r}\cdot\vec{eye} \\ u_x & u_y & u_z & -\vec{u}\cdot\vec{eye} \\ -f_x & -f_y & -f_z & \vec{f}\cdot\vec{eye} \\ 0 & 0 & 0 & 1 \end{bmatrix}$$

**Matriz de Projeção $M_{proj}$ (View → Clip):**

Comprime o frustum da câmera (pirâmide de visão definida por `fov`, `aspect`, `near`, `far`) no cubo NDC. Para WebGPU (Z em [0,1] — profundidade reversa recomendada):

$$M_{proj} = \begin{bmatrix} \frac{1}{\tan(fov/2) \cdot aspect} & 0 & 0 & 0 \\ 0 & \frac{1}{\tan(fov/2)} & 0 & 0 \\ 0 & 0 & \frac{far}{near - far} & \frac{far \cdot near}{near - far} \\ 0 & 0 & -1 & 0 \end{bmatrix}$$

### 3.3 Armazenamento na VRAM: Uniform Buffers

Matrizes 4×4 de float32 ocupam **64 bytes** cada, com **alinhamento de 16 bytes** exigido pelo WGSL.

**Buffer de câmera (global, grupo 0):**

```wgsl
struct Camera {
  view     : mat4x4<f32>, // offset   0, size 64
  proj     : mat4x4<f32>, // offset  64, size 64
  position : vec3<f32>,   // offset 128, size 12
  // padding: 4 bytes implícito (vec3 tem align 16)
}                         // total: 144 bytes

@group(0) @binding(0) var<uniform> camera: Camera;
```

```javascript
const cameraUBO = device.createBuffer({
  label: 'Camera::UBO',
  size: 144,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

// Por frame:
device.queue.writeBuffer(cameraUBO, 0,  viewMatrix);   // offset 0
device.queue.writeBuffer(cameraUBO, 64, projMatrix);   // offset 64
device.queue.writeBuffer(cameraUBO, 128, cameraPos);   // offset 128
```

**Buffer por objeto (grupo 0, binding 1 — ou dynamic offset):**

```wgsl
struct Model {
  matrix        : mat4x4<f32>, // offset  0, size 64
  normalMatrix  : mat4x4<f32>, // offset 64, size 64  ← inversa transposta de M para normais
}                              // total: 128 bytes
```

> A normal matrix é necessária porque normais não transformam como posições: ao escalar não-uniformemente um objeto, normais escaladas diretamente ficam incorretas. A inversa transposta de $M_{model}$ corrige isso.

### 3.4 Dynamic Offsets — Múltiplos Objetos no Mesmo Buffer

Empacotar todas as matrizes modelo num único `GPUBuffer` com stride de 256 bytes (mínimo de alinhamento `minUniformBufferOffsetAlignment`) e variar o offset em runtime evita N trocas de bind group por frame:

```javascript
// Buffer com N model matrices, stride 256 bytes
const modelBuffer = device.createBuffer({
  size: objectCount * 256,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

// Por draw call, apenas muda o offset:
renderPass.setBindGroup(0, sceneBindGroup, [objectIndex * 256]);
renderPass.drawIndexed(mesh.indexCount);
```

### 3.5 Instancing — Uma Draw Call para N Cópias

Quando N objetos compartilham a mesma malha (árvores, projéteis, partículas), o instancing elimina N draw calls e substitui por uma.

As matrizes modelo de todas as instâncias vivem num `GPUBuffer STORAGE`:

```javascript
const instanceBuffer = device.createBuffer({
  label: 'Instances::ModelMatrices',
  size: instanceCount * 64, // mat4x4 = 64 bytes sem padding extra
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
});
```

```wgsl
@group(0) @binding(2) var<storage, read> instances: array<mat4x4<f32>>;

@vertex fn vs(in: VertexInput, @builtin(instance_index) id: u32) -> VertexOutput {
  let model = instances[id];
  out.position = camera.proj * camera.view * model * vec4f(in.position, 1.0);
  // ...
}
```

```javascript
// Uma única draw call desenha todas as instâncias:
renderPass.drawIndexed(mesh.indexCount, instanceCount);
```

---

## Como as Três Camadas se Integram por Frame

```
CPU (Content Timeline)
│
├─ 1. Atualiza transforms (JS calcula matrizes Model de objetos móveis)
│      queue.writeBuffer(modelUBO, offset, newMatrix)
│
├─ 2. Atualiza câmera
│      queue.writeBuffer(cameraUBO, 0, viewMatrix)
│      queue.writeBuffer(cameraUBO, 64, projMatrix)
│
├─ 3. Grava Render Pass
│      encoder.beginRenderPass(...)
│        pass.setPipeline(pipeline)
│
│        // Grupo 0: câmera + dados globais de cena (troca uma vez)
│        pass.setBindGroup(0, cameraBindGroup)
│
│        for each object:
│          // Grupo 1: material do objeto (troca por material único)
│          pass.setBindGroup(1, object.materialBindGroup)
│
│          // Geometria
│          pass.setVertexBuffer(0, object.mesh.vertexBuffer)
│          pass.setIndexBuffer(object.mesh.indexBuffer, 'uint16')
│
│          // Offset para a model matrix desse objeto no UBO
│          pass.setBindGroup(0, cameraBindGroup, [object.index * 256])
│
│          pass.drawIndexed(object.mesh.indexCount)
│
│      pass.end()
│      queue.submit([encoder.finish()])
│
GPU (Queue Timeline) executa tudo acima
```

### Custo de Cada Operação (ordem de custo crescente)

| Operação | Custo relativo |
|---|---|
| `drawIndexed` mesmo pipeline/bindgroup | Baixo |
| `setBindGroup` (troca de material) | Médio |
| `setPipeline` (troca de pipeline) | Alto |
| `queue.writeBuffer` (upload CPU→GPU) | Depende do tamanho |
| Muitas draw calls pequenas (CPU-bound) | Muito alto — usar instancing |

**Regra prática de batching:**
1. Agrupe objetos por pipeline (minimize `setPipeline`)
2. Dentro do mesmo pipeline, agrupe por material (minimize `setBindGroup(1)`)
3. Objetos idênticos (mesma mesh + mesmo material) → instancing com um único `drawIndexed`

---

## Mapa de Relacionamentos: Malha × Material × Transform na VRAM

```
Mesh                         Material                    Transform
──────────────────           ────────────────────        ──────────────────────
GPUBuffer (VERTEX)           GPUTexture (albedo)         GPUBuffer (UNIFORM)
  └─ setVertexBuffer()         └─ createView()             └─ model mat4 (64B)
GPUBuffer (INDEX)            GPUTexture (normalMap)      GPUBuffer (UNIFORM)
  └─ setIndexBuffer()          └─ createView()             └─ camera view+proj
                             GPUSampler                  GPUBuffer (STORAGE)
                               └─ filtering rules          └─ instances[N] mat4
                             GPUBuffer (UNIFORM)
                               └─ material constants
                                  ↓
                             GPUBindGroup (group 1)
                               ├─ binding 0: albedoView
                               ├─ binding 1: normalView
                               ├─ binding 2: sampler
                               └─ binding 3: materialUBO
                                                          GPUBindGroup (group 0)
                                                            ├─ binding 0: cameraUBO
                                                            └─ binding 1: modelUBO
                                                                (dynamic offset)
                             ↓                            ↓
                        GPURenderPipeline
                          vertex:   @location(0..3) ← vertex buffer layout
                          fragment: @group(1) textures + @group(0) camera
                          primitive: triangle-list, cullMode: 'back'
                          depthStencil: depth24plus, depthCompare: 'less'
```

[⬅ Voltar para Computação](./09_Compute_Pass_e_Queries.md) | [**Navegar para o Índice Temático** 🏠](./WEBGPU_STUDY.md)
