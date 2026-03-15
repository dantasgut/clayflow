# 8. Otimização Brutal: Render Bundles (`GPURenderBundle`)

Chamar milhares de `pass.setBindGroup()`, `pass.setPipeline()` e `pass.draw()` para cada uma das 50.000 folhas de uma árvore na CPU via código JavaScript fatalmente engarrafará o frame loop (`requestAnimationFrame`).
A CPU (O JavaScript) demorará mais de 16 milissegundos só para ditar os comandos, e a GPU ficará de braços cruzados esperando ordens.

Para não repetir comandos gigantescos de cenário que são estáticos por horas (como a renderização de toda a arquitetura de uma cidade que não se move), a WebGPU introduziu o incrível **`GPURenderBundle`**.

## 8.1 O Empacotador (`GPURenderBundleEncoder`)

Assim como gravamos comandos genéricos da placa mãe com o `GPUCommandEncoder`, gravamos especificamente fluxos de tela com o `GPURenderBundleEncoder`.
Ele não recebe Texturas da tela de destino imediatas. Nós dizemos *apenas as configurações do hardware da tela* a ele.

```javascript
/* 1. Criar o molde do empacotador isolado */
const gravadorDePacote = device.createRenderBundleEncoder({
  colorFormats: ['bgra8unorm'],     // O Formato esperado lá no futuro!
  depthStencilFormat: 'depth24plus-stencil8', // Aquele Z-Buffer esperado lá no futuro
});

/* 2. Gravar os 50.000 Comandos de folhas estáticas na Memória C++ pura */
gravadorDePacote.setPipeline(pipelineProntoArvoreFolhas);

// Uma hipotética repetição colossal apenas UMA ÚNICA VEZ NO BOOT (Loading) do Cenário!!
for(let i = 0; i < 50000; i++) {
   gravadorDePacote.setBindGroup(0, folhas[i].matrizLocalDaFolhaEspecifica); 
   gravadorDePacote.setBindGroup(1, folhas[i].materialDaFolhaCores);
   gravadorDePacote.setVertexBuffer(0, geometriaFolhaBase);
   gravadorDePacote.draw(300); // Acorde os Vértices em Triângulos da placa de Video! Draw!!
}

/* 3. FECHE O PACOTE MASSIVO (Vira um pacote fechado Binário na Nuvem do Driver!) */
const pacoteAs 50MilFolhas = gravadorDePacote.finish(); 
```

## 8.2 Disparando Mísseis Nuclearmente Rápidos: O `executeBundles`

Agora, todo frame (`requestAnimationFrame`), o JavaScript não perde tempo soletrando 50 mil instruções pros drivers C++. Nós chamamos as ações do `RenderPass` com apenas **UMA LINHA CUSTANDO ZERO PONTOS DE GARGALO.**

```javascript
// loop infinito 60 vezes por segundo...

const pass = encoderCena.beginRenderPass({ /* configs visíveis */ });

// Limpa Céu, desenha dinamicamente algumas explosões que são aleatórias
pass.setPipeline(...);
pass.draw(...);

// INJETAR AS 50 MIL FOLHAS INSTANTANEAMENTE NA GARGUIDA DA GPU!!
pass.executeBundles([ pacoteAs50MilFolhas ]); 
// Literalmente 1 milésimo de milissegundo em gargalo CPU. O Driver da Placa engole os C++ de uma vez enjaulados na VRAM. O framerate do jogo salta aos estrondosos 800 FPS em monitores G-Sync de altíssima tensão!

pass.end();
device.queue.submit([encoderCena.finish()]);
```
É obrigatório usar Render Bundles em aplicações complexas em WebGPU onde objetos do plano de fundo não sofrem mudanças de Material (texturas) ou posições brutas. 

[⬅ Voltar para Passes de Renderização](./07_Pipeline_de_Renderizacao_e_Passes.md) | [Próximo: Computação e Queries ➡](./09_Compute_Pass_e_Queries.md)
