# 4. Texturas, Vistas e Samplers (Imagens na GPU)

A Textura não é "apenas uma foto". Na WebGPU, uma textura é um espaço multi-dimensional pesado para gravar de informações coloridas visíveis ou matemáticas puras (Mapeamento de Sombras, Coordenadas G-Buffer, Bump-map Relevos ou Z-Buffers Matemáticos) fatiados em blocos contíguos de memória.

## 4.1 Formatos (`GPUTextureFormat`)

Existem dezenas de formatos estritos para Texturas, alguns não representam dados fotográficos humanos convencionais. Ex: `rbga8unorm` suporta Red, Green, Blue, Alpha num byte cada (4 bytes). Já o formato fundamental `depth24plus-stencil8` serve unicamente para dizer à Rasterizer "quão fundo" está os milímetros na perspectiva contraposto aos triângulos, e não guarda nenhuma cor visível real.

## 4.2 Criando a Maleta: `GPUTexture`

```javascript
const texture = device.createTexture({
  size: [1024, 1024, 1], // Dimensão Extent3D: 1024x1024 Planos. Profundidade de Camada: 1 Imagem.
  format: 'rgba8unorm',  // 4 Bytes não assinados (Padrão 2D SRGB) 
  usage: GPUTextureUsage.TEXTURE_BINDING // O nosso Shader WGSL PODE e VAI LE-LA usando group(0)!
       | GPUTextureUsage.COPY_DST        // O queue.writeTexture PODE gravar nela!
       | GPUTextureUsage.RENDER_ATTACHMENT // PODE ser destino alvo primário do Output Merger!!
});
```

Apenas CRIAR este componente o deixa completamente em branco. Para preencher os milhares de blocos minúsculos RGBA, o leitor precisa [Usar Cópias, como visto Anteriormente](./03_Copias_de_Dados_e_Queues.md) e rodar o `copyExternalImageToTexture`.

## 4.3 O Periscópio Mágico: `GPUTextureView`

A Memória bruta da `GPUTexture` JAMAIS é lida ou gravada diretamente pelo Pipeline ou Fragment Shader. Isso não faz sentido na arquitetura.
Para o motor trabalhar, embutimos as texturas através de um `GPUTextureView` ("Um Prisma/Vista de Observação").

A "Vista" serve porque podemos criar UMA `GPUTexture` gigantesca (Atlas de Combate) e enviar dezenas de Vistas para Render Passes apontando como "Lentes de Aumento" para recortes menores da imagem bruta de acordo com nossa instrução de vista.

```javascript
// Criando a vista da textura primária pra passar ao nosso material do Cubo
const viewPadraoFundoMadeira = texture.createView();

/* Para anexá-la a Render Passes da Tela FÍSICA do Computador que pede "A Cor" final, fazemos o mesmo! */
const telaFisicoWebGPU = context.getCurrentTexture(); // Da o bloco em branco
const viewDaTelaVisivel = telaFisicoWebGPU.createView(); // Lente para gravarmos
```

## 4.4 O Filtro de Regras: `GPUSampler`

Imagine que há um pixel do Cubo de mineraçào deitado perfeitamente na sua tela num angulo longe a 415 mil metros de distãncia.
Se a imagem da Madeira do Cubo (`GPUTexture`) é Ultra-HD 4096x4096px, O Fragment Shader será invocado naquele pixel *cru*. E ele pedirá: "Senhor Texture... me de a cor desse pontinho de 1 milimetro". Ele fatalmente irá colidir contra os blocos matemáticos do UV: O sistema deve *Arredondar e Retornar Aquele pixel Exato (Nearest/Serrilhado)*? Ou ele *Mistura as Cores dos 8 vizinhos gerando um degrade esfumaçadinho bonito da Madeira (Linear Interpolation)*?

O **`GPUSampler`** responde como ler a Vista pra resolver essas aberrações matemáticas! (Isso se chama Filtragem / MIP Mapping Rules).

```javascript
const sampleDeFiltroMadeiraPesado = device.createSampler({
  magFilter: 'linear',  // Lupa de Aumento: 'linear' = Esfumaça quando fica Muito Perto da Câmera (anti-pixelização). 'nearest' = Pixel-Art Cru.
  minFilter: 'linear',  // Lupa Encolhedora: 'linear' = Esfumaça quando os Poligonos se afastam no horizonte z.
  mipmapFilter: 'linear', // Em distâncias colossais: Mudar nivel Mip. Ex: O Jogo Troca uma lona 4K para uma foto 256x256 automaticamente.

  addressModeU: 'repeat', // Ao ler o eixo X (U, 2D) acima de 100%, oq faz? Reembala de 0 pra ladrilhar o chão do infinito da mesma foto?!
  addressModeV: 'repeat', // Ladrilhar no Eixo Y da Textura.
  
  maxAnisotropy: 16 // O filtro Anisotrópico que arranca borrões massivos do chão na linha do horizonte que jogos antigos não suportavam!
});
```

A `GPUTextureView` + `GPUSampler` formarão **A Imagem Visível (O Material)** que as bindings do *Render Pipeline WGSL* e as camadas *Fragment Shaders* consumirão mais tarde em perfeita união.

[⬅ Voltar para Cópias](./03_Copias_de_Dados_e_Queues.md) | [Próximo: Shaders e WGSL ➡](./05_Shaders_e_WGSL.md)
