# 1. Fundamentos e Inicialização (WebGPU & Canvas)

O WebGPU utiliza um modelo arquitetônico explícito, diferente do WebGL clássico (baseado em estado global modificado internamente via dezenas de binds).

![Hierarquia de Objetos WebGPU](/img/guides/webgpu_hierarchy_diagram_1772901831909.png)

## 1.1 O Ecossistema: Adapter e Device

A inicialização do WebGPU segue um pipeline assíncrono estrito (`navigator.gpu`):

```javascript
if (!navigator.gpu) throw new Error("WebGPU não suportado por este navegador.");

// 1. Adapter: A conexão com o driver físico da GPU
const adapter = await navigator.gpu.requestAdapter({
  powerPreference: "high-performance" // Opções: 'low-power' ou 'high-performance'
});

// 2. Device: A "GPU Virtual" alocada para sua aba do navegador
const device = await adapter.requestDevice({
  requiredFeatures: ['texture-compression-bc'], // Requisita extensões
  requiredLimits: { maxStorageBuffersPerShaderStage: 16 } // Levanta tetos de memória
});
```

*   **`GPUAdapter`**: Representa os limites físicos da máquina. Aqui você pode ler `adapter.limits` ou consultar quais extensões de textura a GPU suporte em `adapter.features`.
*   **`GPUDevice`**: É a principal interface do desenvolvedor. **Toda e qualquer criação de objetos (Buffers, Texturas, Pipelines)** emana do `GPUDevice`. 

## 1.2 Configurando a Saída Visual (The Canvas)

O WebGPU não sabe o que é uma aba do Browser. Sem um Canvas especial devidamente amarrado à GPU, o WebGPU seria "cego", executando cálculos obscuros na memória de vídeo (VRAM) sem lugar para exibi-los.

```javascript
const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu'); // O contexto não é mais 'webgl'

// Formato nativo da tela do usuário. (ex: bgra8unorm ou rgba8unorm)
const presentationFormat = navigator.gpu.getPreferredCanvasFormat(); 

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied' // Como a janela lida com transparência contra o HTML em volta
});
```

Ao rodar `.configure`, dizemos que este Canvas terá uma "porta" ligada a uma memória reservada na Placa de Vídeo. Durante cada frame geramos uma Textura que o Canvas puxará para a tela do usuário.

O contexto pode ser desconfigured com `context.unconfigure()`, liberando a associação com o device atual (útil ao recriar o device após perda).

A propriedade `toneMapping` aceita `'linear'` (padrão) ou `'reinhard'`, habilitando suporte a conteúdo HDR quando disponível.

## 1.3 As Três Timelines

A spec W3C define três contextos de execução separados:

- **Content Timeline** — onde o JavaScript roda: cria objetos, grava comandos no `GPUCommandEncoder`.
- **Device Timeline** — onde o user agent / driver valida e processa os descritores. Pode rodar num processo separado do browser.
- **Queue Timeline** — onde os núcleos físicos da GPU executam de fato os shaders, draws e dispatches após o `queue.submit()`.

A comunicação de volta ao JS (leitura de buffer, fim de trabalho) é sempre assíncrona via Promises.

## 1.4 Errors e Debugging

O `GPUDevice` isola as falhas. Se você envia comandos corrompidos para a VRAM, a página inteira não cai, mas o Objeto gerado torna-se "inválido".

*   **Device Lost (Perda Completa)**: Quando a CPU reinicia os drivers (ex: atualizar driver de video no meio do jogo).
    ```javascript
    device.lost.then((info) => {
      console.error(`Placa de vídeo desconectou: ${info.message}`);
      // Lógica pesada de UI perguntando ao usuário para recarregar a pagina.
    });
    ```
*   **Uncaptured Errors**: Falhas comuns de validação de comandos (ex: mandar um buffer 1 byte menor que o exigido).
    ```javascript
    device.addEventListener('uncapturederror', (event) => {
      console.error('Um erro síncrono da GPU foi ejetado pela promessa:', event.error.message);
    });
    ```
*   **Error Scopes (Blocos de Try/Catch de VRAM)**: Envolva código sensível do device:
    ```javascript
    device.pushErrorScope('validation');
    const myBadBuffer = device.createBuffer({ size: 3, usage: GPUBufferUsage.VERTEX }); // Erro! tamanho deve ser multiplo de 4
    device.popErrorScope().then((error) => {
        if (error) console.error("Achamos a falha local! ", error.message);
    });
    ```

[Índice](./WEBGPU_STUDY.md) | [Próximo: Buffers e Memória ➡](./02_Buffer_e_Layout_Memoria.md)
