# 9. Compute Passes, Debug Markers & Profiling (Queries)

Para tarefas assombrosamente pesadas de inteligência artificial vetorial, simulação de fluidos, criptografia paralela e sistemas com 5 milhões de partículas colidindo na tela que derreteriam qualquer modelo padrão JavaScript assíncrono. O `GPUComputePass` descarta toda burocracia do pipeline visual (Canvas, Fragment, Cores) entrando num ambiente brutal matemático.

## 9.1 GPU Compute Passes: "Caixas de Trabalhadores"

```javascript
/* 1. Criar Buffer Matemático Cru na VRAM */
const bufferParticulas = device.createBuffer({ 
  size: 50000 * 16, // Espaço pra 50.000 Posições e Velocidades (Vector4f xyz e w para tempo)
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST 
  // Nao usamos VERTEX. "STORAGE" significa acesso Leitura/Escrita aleatória plena via GPU!
});

// 2. Compilar e Conectar a Pass (Note: 'compute' ao invés de 'vertex/fragment' no Shader)
const pipelineFisica = device.createComputePipeline({
    layout: 'auto', // Facilidade que puxa o layout nativamente!
    compute: { module: moduloShaderInteligenciaAritifical, entryPoint: "simular_particula" }
});

const myBind = device.createBindGroup({ layout: pipelineFisica.getBindGroupLayout(0), entries: [{binding:0, resource: { buffer: bufferParticulas }}] })

// 3. Encapsulamento
const passC = encoderCena.beginComputePass();
      passC.setPipeline(pipelineFisica);
      passC.setBindGroup(0, myBind);

      // Despachar 1.000 caixas! Se o Shader disser "64 Threads por Caixa", ligarão 64.000 núcleos instantâneos simultâneos rodando sobre os Storage Buffers nas Memórias Unificadas C++ Internas para Física Pura!
      passC.dispatchWorkgroups(1000, 1, 1); 
passC.end();
```

## 9.2 Ocultando Complexidade do Spector.js (Debug Markers)

Ao abrir os Inspecionadores e Profilers da Placa (`Spector.JS`, `RenderDoc` da vida real C++), todos os envios são um pesadelo "PULL BUFFER 0", "DRAW 300 VERTEX". É uma confusão abstrata ilegível.
Use **Debug Groups** para etiquetar humanamente seus Encoders de Hardware:

```javascript
encoderCena.pushDebugGroup("💥 Atualizador de Física - Nível 3");
const passCompute = encoderCena.beginComputePass();
// ...
encoderCena.popDebugGroup();
// Ao abrir as ferramentais de Depuração da Microsoft/Chrome, o rótulo estará brilhando na Árvore de Pilha C++.
```


## 9.3 Profiling Nativo de Placa: `GPUQuerySet`

Como saber quanto tempo O CÓDIGO DA GPU (não do JS) demorou para emular aquele sol da Galáxia de Andrômeda visualmente renderizado?!
Usando `Timestamp Queries`. As medições da Memória WebGPU têm precisão letal nos Nanosegundos (1 Bilionésimo do Segundo de Hardware).

### A Criação de Relógios (O Set Cronômetro)
```javascript
// Criar Espaço para 2 cronômetros (InicioFrame e FimFrame) 
const conjuntoRelogio = device.createQuerySet({
   type: 'timestamp', 
   count: 2
});

const bufferRespostaNanoSinal = device.createBuffer({
   size: 2 * 8, // Dois sinais Int64Bytes brutos!
   usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
});
```

### Análise Profiler do WebAssembly Gráfico

Para medir passagens brutas sem tocar no relógio do computador lento em cima da prancha da CPU (Date.Now NodeJS):

```javascript
// 1. Ao iniciar a Pipeline de Renderização brutal...  Avise a GPU para "ANOTAR O TEMPO DA PLACA LOCAL" no Ponteiro de Relógio [0].
const passDeTeste = encoderCronometro.beginRenderPass({
   /*... config ...*/
   timestampWrites: { // <-- Essa é a sacada da Spec!!
       querySet: conjuntoRelogio,
       beginningOfPassWriteIndex: 0,
       endOfPassWriteIndex: 1 
   }
});

// ... faz as magias do Bindings, Pipelines...
passDeTeste.end();

// 2. Transcrever a resolução Assíncrona do "QuerySet (Sinal Fechado)" para um GPUBuffer real e estrito onde nosso javascript consiga baixar via mapAsync depois se quiser!!
encoderCronometro.resolveQuerySet(conjuntoRelogio, 0, 2, bufferRespostaNanoSinal, 0);

device.queue.submit([encoderCronometro.finish()]); 

// -> POSTERIORMENTE: Baixe via mapAsync o `bufferRespostaNanoSinal` e subtraia o EndIndex (1) pelo StartIndex(0). Essa diferença são os nanosegundos exatos brutos do poder computacional gráfico usado!!
```
**(Obs: Para proteção contra ataques de Timing e Spectre/Meltdown as APIs podem exigir ativamentos específicos no About:Flags da Config do navegador pra precisão Real Máxima não degradante, mas localmente developper/localhost funciona.)*

[⬅ Voltar para Bundles](./08_Bundles_e_Comandos.md) | [Próximo: Clímax - Hierarquia 3D ➡](./10_Hierarquia_Objetos_3D.md)
