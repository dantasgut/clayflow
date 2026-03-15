# 3. Filas e Sistema Massivo de Cópias de Dados

O WebGPU gerencia a manipulação de dados em duas frentes vitais: O Gravador de Comandos Assíncronos (A CPU planejando) e A Fila de Execução (`GPUQueue` - o Motor rodando).

Nesta camada de hardware, os dados não "Movem", eles quase sempre são "Copiados" freneticamente entre pontes da memória.

## 3.1 A Via Expressa: `device.queue.writeBuffer`

Diferente do penoso recurso de Mapeamento (mapAsync) ou o lento Pipeline, escrever diretamente em Buffers usando a Fila (`Queue`) envia o processamento lógicas em C++ debaixo dos panos. É a forma definitiva (e recomendada pela spec) para mudar dados da cena, posições de vértices ou Uniforms Todo Único Frame (Double-Buffering).

```javascript
// O Triângulo que fizemos com 36 bytes locais (C++, JS RAM)
const data = new Float32Array([0.0, 0.5, 0.0, /* ... */]);

// bufferVazio originou-se do device.createBuffer com Uso COPY_DST (Destino de cópia)
// queue.writeBuffer(destino, descolamentoLocalEmBytesVRAM, fonteDataJS)

device.queue.writeBuffer(bufferVazio, 0, data); 
```
Pronto, extremamente eficiente. Você envia as matrizes de Câmera daquele frame para cá sem hesitar usando ele. Se o objeto local em RAM (`data`) apagar do Javascript, a placa de vídeo continuará com a cópia sagrada trancada nos chips dela.

## 3.2 O Preenchimento Massivo Textural: `writeTexture`

Texturas (Imagens Bitmap de Cores/Pixeis) são colossais. Elas frequentemente usam Pitchs de alinhamento (`bytesPerRow`). Subir imagens da tag `<img>` html usa esse atalho específico:

```javascript
/* Após criamos nossa GPUTexture vazia... vamos preenche-la */
device.queue.writeTexture(
  { texture: minhaGPUTexture },                // Destino (Textura nativa da GPU)
  dadosDePixelsPurosImagemJS,                  // ArrayBuffer (Uint8Array de cores RGBA da CPU)
  { bytesPerRow: larguraDaImagem * 4 },        // Duração Horizontal real por scanline da CPU (4 bytes de RGBA)
  { width: larguraDaImagem, height: altura }   // Blocos (Extent3D) de pixels a substituir!
); // Boom! Puxado para a Máquina visual.
```
> **Dica W3C**: Você também pode usar atalhos espertos fornecidos aos browsers modernos como `device.queue.copyExternalImageToTexture({ source: imgHTMLVideoDOMBrowser }, { texture: minhaGPUtx })` que absorve diretamente o ponteiro gráfico sem tocar na RAM local JavaScript.

## 3.3 A Arte do GPUCommandEncoder

O `GPUCommandEncoder` não executa NADA na placa. Ele abre um caderno limpo de intenções para o chip lógico assíncroneo que você passará à Placa de Vídeo depois. Aqui, copiamos blocos gigantes sem jamais tocar ou baixar para a lerdeza do JavaScript usando os comandos `copyXYZtoZYX`: 

```javascript
// 1. O Planejador
const encoder = device.createCommandEncoder();

// Comando 1: Copiar 1 Gigabyte da memória A inteiramente pra memória B
// Sem uso do navegador, taxa brutal de > 800GB/s internos da placa PCI-E
encoder.copyBufferToBuffer(
  bufferPassadoCheioDados, 0, // Origem e bit Inicial
  novoBufferBackupFisica, 0,  // Destino e bit inicial  
  tamanhoEmBytes1Giga         // Extensão de cópia
);

// Comando 2: Baixar a textura renderizada final crua para um Storage Buffer pra extrair Screenshot!
encoder.copyTextureToBuffer(
  { texture: texturaDaTelaFinalCanvasRenderizado },  // Origem
  { buffer: bufferLentoExtrairSS_ReadModeJS, bytesPerRow: 7680 }, // Destino
  { width: 1920, height: 1080 } 
);

// 2. Transcrever tudo para uma fita (CommandBuffer) que o Hardware engole e fecha o caderno
const asOrdensMatadoras = encoder.finish(); 

// 3. O Despacho (Submiting para a GPU de Verdade via Queue)
device.queue.submit([ asOrdensMatadoras ]); 
```

O uso magistral dessas transferências é o que divide uma página de WebAssembly engasgando a 20 FPS e um código polido rodando suavemente em um simulador paralelo de fluido maciço de um trilhão de bytes as 144 FPS.

[⬅ Voltar para Buffers e Layout](./02_Buffer_e_Layout_Memoria.md) | [Próximo: Texturas e Samplers ➡](./04_Texturas_e_Samplers.md)
