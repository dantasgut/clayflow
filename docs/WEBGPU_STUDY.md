# 📖 Estudo Completo WebGPU & WGSL

Bem-vindo à documentação modular definitiva do WebGPU, cobrindo todos os fluxos de arquitetura, matemática profunda de matrizes e comandos W3C de placa gráfica. 

Selecione um dos tópicos abaixo para iniciar sua jornada partindo de Fundamentos até Profiling de Hardware Avançado de Instancing 3D:

## Módulo 1: Fundamentos e Inicialização
1. [Fundamentos e Inicialização (WebGPU & Canvas)](./01_Fundamentos_e_Inicializacao.md)
   *Como conectar a placa (Adapter/Device), instanciar o Canvas e interceptar Erros Gráficos físicos.*
1.1 [A Arquitetura Oculta Extensível (GPUObjectBase)](./01.1_A_Arquitetura_GPUObjectBase.md)
   *A herança unificada da WebGPU: Labels, GC Manual (`destroy`) e as Famílias de Classes da VRAM.*

## Módulo 2: Memória e Movimentação de Dados
2. [Buffers e Layout de Memória](./02_Buffer_e_Layout_Memoria.md)
   *O pesadelo do alinhamento (vec3 == 16bytes), criação de FloatArrays e MapAsync.*
3. [Copias de Dados e Queues](./03_Copias_de_Dados_e_Queues.md)
   *Cópias explícitas (`writeBuffer`, `writeTexture`) e as transferências C++ entre VRAMs (`copyBufferToBuffer`).*

## Módulo 3: Imagens e Amostragem
4. [Texturas, Vistas e Samplers](./04_Texturas_e_Samplers.md)
   *Entenda os blocos dimensionais de imagens (`GPUTexture`), A Lente do Programador (`View`) e a Lupa de Filtro do Shader (`GPUSampler`).*

## Módulo 4: Shaders e Layout de Recursos
5. [Shaders e Compilação WGSL](./05_Shaders_e_WGSL.md)
   *Sintaxe `@builtin`, Variaveis Estritas e Entry Points pre-compilados (`Hints`).*
6. [O Coração de Dados: Resource Bindings](./06_Resource_Bindings.md)
   *Como "A Memória da Placa" se vincula com o "Código do WGSL" através do Layout de Contrato Estático.*

## Módulo 5: Renderização
7. [Pipeline de Renderização e Passes](./07_Pipeline_de_Renderizacao_e_Passes.md)
   *O Blindado `RenderPipeline` (Topologia, DepthStencil, Blending State) e sua execução via Command Encoder Passes.*
8. [Otimização Brutal: Render Bundles](./08_Bundles_e_Comandos.md)
   *Despachando Cidades de 50.000 Mesh Arrays num Custo-Zero de Javascript via Injeção Enjaulada.*

## Módulo 6: Avançado, Computação e Profiling
9. [Compute Passes e Profiling Queries](./09_Compute_Pass_e_Queries.md)
   *Simulação de Inteligência Artifical Pura por Caixas Simultâneas, Marcações de Debug Visual e Cronometros via Timestamp Queries de Hardware.*

## Módulo 7: Scene Graph Prático (Clímax)
10. [A Prática: Instancing e Matemática de Vetores 3D](./10_Hierarquia_Objetos_3D.md)
    *Como a Deformação por Matrizes transforma Modelos Ocos. O que é Produto Vetorial e Matriz TBN pra Iluminação Realista, e o trunfo do Multi-Instancing via buffer.*

---

> Documento de referência profunda baseado nas especificações oficiais da W3C.

## Dicas
Verifica erros no código
npx tsc --noEmit
