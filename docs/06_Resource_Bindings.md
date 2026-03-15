# 6. O Coração de Dados: Resource Bindings

Como exatamente o seu Shader de WGSL (Página Anterior) se conecta aos Buffers (Capítulo 2) e às Texturas (Capítulo 3) e Texturas e Samplers (Capítulo 4)?
O recurso fundamental que une "Concreto/Memória (GPU)" e "Abstrato/Código (Shader)" chama-se **Resource Binding**.

Sem isso, a WebGPU seria apenas um bloco de pintura cego. 
Essa divisão arquitetural acontece em Duas Etapas independentes.

## 6.1 O Molde/Template Abstrato: `GPUBindGroupLayout`

A primeira coisa a fazer é criar um "Modelo de Plug". Ele avisa estritamente ao Render Pipeline **O que esperar** dos dados que fluirão pelas tubulações, sem nunca encostar ou segurar um byte físico sequer.

```javascript
/* 
 Criamos um "Contrato" contendo 3 Pinos (Entries).
 "Olá Pipeline. Nesse plug (Group), nós enfiaremos sempre UM buffer de física, UMA Textura e UM Sampler de filtro nesta exata Ordem e Regra!" 
*/
const layoutDeMadeiraEHeroi = device.createBindGroupLayout({
  entries: [
    {
      binding: 0, // O "Pino 0" do Shader WGSL (@binding(0))
      // Informando que o Vertex Shader VAI precisar de Posições pra deformar!
      visibility: GPUShaderStage.VERTEX, 
      buffer: { type: 'uniform' } 
    },
    {
      binding: 1, // "Pino 1"
      // Ambos Shaders (Vertex pra Displace mapping / Fragment pra Cor) poderão ler!
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, 
      texture: { sampleType: 'float' }
    },
    {
      binding: 2, // "Pino 2"
      visibility: GPUShaderStage.FRAGMENT, 
      sampler: { type: 'filtering' }
    }
  ]
});
```

A criação do Render Pipeline exige os Layouts. Esse layout **jamais muda!**. Ele destrava as portinholas.

## 6.2 O Encaixe Concreto (A Tomada Real): `GPUBindGroup`

Agora sim, em runtime, a cada Frame ou Troca de Instância, precisamos conectar a Energia e a Memória no Template!
Se temos 5 Jogadores na tela com espadas de madeira, instanciamos na VRAM 5 `GPUBindGroup`. Todos criados **obedecendo o Molde idêntico** acima!

```javascript
const machadoGiganteVerdeFogo = device.createBindGroup({
  layout: layoutDeMadeiraEHeroi, // Assinando o contrato, provando que seguiremos as regras!
  entries: [
     // Pino 0 do WGSL : Recebendo finalmente o Nosso GPUBuffer localizado criado no capitulo 2! (Tamanho 64)
    { binding: 0, resource: { buffer: meuBufferXYZOeste1, size: 64, offset: 0 } },
     // Pino 1 : O Periscópio Mágico View da Foto!
    { binding: 1, resource: viewTexturaVerdeFogoAlien },
     // Pino 2 : Regra de leitor de Foto Sampler!
    { binding: 2, resource: filtroNearestMHDArt }
  ]
});

// A Espada 2 seria IDÊNTICA. Copiar/Colar o código acima, trocar só "meuBufferXYZLeste8" para "binding 0"! E assim se forma uma Hierarquia/Material gráfico reutilizável assombrosamente veloz!
```

## 6.3 O Lado do WGSL (Destino)

No código WGSL, a declaração refletirá rigorosamente a exata ordem abstrata para consumir e extrair os valores matemáticos puros na Física da Placa de Vídeo.

```wgsl
// Declarando que esse Grupo usou o nosso @group(0) inteiro,
// com seus 3 "Pinos" (bindings) conectados por nós logo acima!

@group(0) @binding(0) var<uniform> fisicaMatrizPosicaoHeroi: mat4x4<f32>;
@group(0) @binding(1) var texturaCores: texture_2d<f32>;
@group(0) @binding(2) var filtroAmostra: sampler;
```

A WebGPU validará em *Microssegundos* se `fisicaMatrizPosicaoHeroi` é do tipo 'Uniform' e se ocupa `64 Bytes`. Qualquer fraude ou falha do JS jogará o Canvas num **Device Error** imediato.

[⬅ Voltar para Shaders e WGSL](./05_Shaders_e_WGSL.md) | [Próximo: Pipeline de Renderização e Passes ➡](./07_Pipeline_de_Renderizacao_e_Passes.md)
