# 2. Buffers e Layout de Memória

A memória do WebGPU (VRAM) é estritamente gerenciada pelo desenvolvedor. Diferente do JavaScript onde variáveis crescem infinitamente, na VRAM declaramos `Float32Arrays` fixas em bytes. 

Errar memória e preenchimento (padding) na GPU causa anomalias visuais ou travamentos sem sentido definidos pela especificação W3C WGSL.

## 2.1 A Criação de um Buffer (`GPUBuffer`)

Buffers são arrays de bytes unidimensionais alocados na placa de vídeo. 
Eles não tem "tipo" (não existe Buffer de Float nativamente na API Base), eles são **agrupamentos de Bits crus** que ganham tipagem apenas quando o Shader (WGSL) tenta acessá-los.

```javascript
/* 
1. CPU Cria os Dados (ex: 3 vértices {x,y,z}) 
2. Array Pede 4 bytes por número (Float32). Total: 3 * 3 * 4 = 36 bytes.
*/
const data = new Float32Array([
    0.0,  0.5, 0.0, // Topo
   -0.5, -0.5, 0.0, // Baixo-Esquerda
    0.5, -0.5, 0.0  // Baixo-Direita
]);

// 3. Reservando o terreno na placa de Vídeo!
const meuBuffer = device.createBuffer({
  label: "Triângulo Vertex Buffer", // Label é útil para Debug Markers 
  size: data.byteLength,            // Pedindo 36 bytes VAZIOS na VRAM
  
  // Usage Bitmask: Dizendo à GPU O QUÊ faremos com esse terreno!
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST 
});
```

`Usage Flags` são máscaras binárias combinadas com `|`. Tabela completa de flags:

| Flag | Uso |
|---|---|
| `VERTEX` | Fonte de vértices no Input Assembler |
| `INDEX` | Fonte de índices no Input Assembler |
| `UNIFORM` | Leitura como uniform buffer nos shaders |
| `STORAGE` | Leitura e escrita aleatória em compute/fragment shaders |
| `COPY_SRC` | Origem em operações de cópia |
| `COPY_DST` | Destino em operações de cópia e `writeBuffer` |
| `INDIRECT` | Parâmetros de `drawIndirect` / `dispatchWorkgroupsIndirect` |
| `QUERY_RESOLVE` | Destino de `resolveQuerySet` (timestamp/occlusion) |

A propriedade `mapState` reflete o estado atual do buffer em tempo real: `"unmapped"` (GPU pode usar), `"pending"` (mapeamento em andamento), `"mapped"` (JS pode ler/escrever via `getMappedRange`).

## 2.2 O Labirinto do `mapAsync`

Existem momentos raros em que precisamos LER (`MAP_READ`) ou ESCREVER (`MAP_WRITE`) de forma síncrona/direta memórias da GPU dentro do escopo do Javascript. Fazer isso obriga a VRAM a sincronizar com a RAM local.

```javascript
// A técnica "Mapeamento Direto" apenas para pequenos lotes de Uniforms estáticos:
const uniformBuffer = device.createBuffer({
  size: 64, // Matriz 4x4
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  mappedAtCreation: true // Trava a memória para o JS IMEDIATAMENTE!
});

// Acessando a gavinha RAM reservada dentro do objeto VRAM
const ponteiroLocal = new Float32Array(uniformBuffer.getMappedRange());
ponteiroLocal[0] = 5.0; // zoom etc
uniformBuffer.unmap();  // DESBLOQUEIA a memória para a Placa de Vídeo ler lá dentro! (Ponteiro C++)
```
*(Cuidado: Ler dados gerados pela GPU em Compute Shaders usando `mapAsync(GPUMapMode.READ)` trava a pipeline gráfica pra velocidade local do navegador de forma letal para FPS alto)*.

## 2.3 A Regra de Ouro do Alinhamento de Layout WGSL (Tipos)

Toda variável exportada para o layout Uniform ou Storage do Shader (WGSL) requer que seu byte inicial seja divisível pelo "alinhamento mínimo" próprio, senão o WebGPU corrompe (paddings invisíveis).

| Tipo WGSL   | Equivalente JS     | Bytes | Alinhamento Requerido |
|-------------|--------------------|-------|-----------------------|
| `f32`       | Float32Array (1)   | 4     | 4 bytes               |
| `i32`       | Int32Array (1)     | 4     | 4 bytes               |
| `vec2<f32>` | Float32Array (2)   | 8     | 8 bytes               |
| `vec3<f32>` | Float32Array (3)   | 12    | **16 bytes** 🚨       |
| `vec4<f32>` | Float32Array (4)   | 16    | 16 bytes              |
| `mat4x4<f32>`| Float32Array (16)  | 64    | 16 bytes              |

### O Exemplo Crítico WGSL <-> JavaScript

WGSL:
```wgsl
struct CameraState {
  zoom: f32,           // Align: 4, Size: 4,  Offset: 0
                       // -- ESPAÇO VAZIO MÁGICO DE 12 bytes PADDING --
  position: vec3f,     // Align: 16, Size: 12, Offset: 16
                       // -- ESPAÇO VAZIO DE 4 bytes PADDING --
  viewProj: mat4x4f,   // Align: 16, Size: 64, Offset: 32
}                      // Tamanho Total Final: 96 Bytes
```

JS enviando via Array (Note o padding fantasma ignorado sendo preenchido no JS para não quebrar a ordem):
```javascript
const structView = new Float32Array(96 / 4); // 24 indices flutuantes

structView[0] = 5.0; // zoom (offset 0)
// indices 1, 2, 3 SÃO INVÁLIDOS E DESCARTADOS NO ENVIO (padding)!
structView[4] = 100.0; // positionX (offset byte 16 -> index 4)
structView[5] = 200.0; // positionY
structView[6] = 50.0;  // positionZ
// index 7 é padding também já que vec3 ocupa 12 mas é enclausurado em 16!
structView[8] = 1.0;   // viewProj (offset byte 32 -> index 8 = Matrix M11)
```

[⬅ Voltar para Inicialização e Fundamentos](./01_Fundamentos_e_Inicializacao.md) | [Próximo: Copias de Dados e Queues ➡](./03_Copias_de_Dados_e_Queues.md)
