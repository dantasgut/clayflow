# 📖 Estudo Completo WebGPU & WGSL

Bem-vindo à documentação modular definitiva do WebGPU, cobrindo todos os fluxos de arquitetura, matemática profunda de matrizes e comandos W3C de placa gráfica. 

Selecione um dos tópicos abaixo para iniciar sua jornada partindo de Fundamentos até Profiling de Hardware Avançado de Instancing 3D:

## Módulo 1: Fundamentos e Inicialização
1. [Fundamentos e Inicialização (WebGPU & Canvas)](./01_Fundamentos_e_Inicializacao.md)
   *Adapter/Device, configuração do Canvas (`configure`/`unconfigure`/`toneMapping`), as três Timelines (Content · Device · Queue) e Error Scopes.*
1.1 [A Arquitetura Interna: GPUObjectBase](./01.1_A_Arquitetura_GPUObjectBase.md)
   *Herança unificada da WebGPU: `label`, `destroy()` e as quatro famílias de objetos (`GPUBuffer`, `GPURenderBundle`, `GPUQuerySet`…).*

## Módulo 2: Memória e Movimentação de Dados
2. [Buffers e Layout de Memória](./02_Buffer_e_Layout_Memoria.md)
   *Usage flags completos (`VERTEX`/`INDEX`/`UNIFORM`/`STORAGE`/`INDIRECT`/`QUERY_RESOLVE`…), `mapState`, alinhamento WGSL (vec3 = 16 bytes) e `mappedAtCreation`.*
3. [Cópias de Dados e Queues](./03_Copias_de_Dados_e_Queues.md)
   *`writeBuffer`, `writeTexture`, `copyExternalImageToTexture`, transferências encoder (`copyBufferToBuffer`, `clearBuffer`) e sincronização via `onSubmittedWorkDone`.*

## Módulo 3: Imagens e Amostragem
4. [Texturas, Vistas e Samplers](./04_Texturas_e_Samplers.md)
   *`GPUTexture` (1D/2D/3D, mips, MSAA), `GPUTextureView`, `GPUSampler` (filtros, address modes, anisotropia) e `GPUExternalTexture` (vídeo/câmera).*

## Módulo 4: Shaders e Layout de Recursos
5. [Shaders e Compilação WGSL](./05_Shaders_e_WGSL.md)
   *`GPUShaderModule`, `compilationHints`, inspeção de erros com `getCompilationInfo` (`GPUCompilationMessage`), `@builtin` e `@location`.*
6. [Resource Bindings](./06_Resource_Bindings.md)
   *`GPUBindGroupLayout`, `GPUBindGroup`, `GPUPipelineLayout`, `layout: 'auto'`, `getBindGroupLayout()` e dynamic offsets (`hasDynamicOffset`).*

## Módulo 5: Renderização
7. [Pipeline de Renderização e Passes](./07_Pipeline_de_Renderizacao_e_Passes.md)
   *`GPURenderPipeline` (vertex/fragment/primitive/depthStencil/multisample/blend), `createRenderPipelineAsync`, Render Pass com `setViewport`/`setScissorRect`/`drawIndirect`.*
8. [Render Bundles](./08_Bundles_e_Comandos.md)
   *`GPURenderBundleEncoder`, pré-gravação de geometria estática e `executeBundles` para eliminação de overhead de JavaScript por frame.*

## Módulo 6: Avançado, Computação e Profiling
9. [Compute Passes, Queries e Debug](./09_Compute_Pass_e_Queries.md)
   *`GPUComputePassEncoder` (`dispatchWorkgroups`/`Indirect`), **Occlusion Queries** (`beginOcclusionQuery`/`resolveQuerySet`), **Timestamp Queries** e Debug Groups.*

## Módulo 7: Malha, Material e Transformação
10. [Malha, Material e Transformação — Da Álgebra Linear à VRAM](./10_Hierarquia_Objetos_3D.md)
    *Sistema de coordenadas WebGPU; vértice como estrutura de dados (position/normal/tangent/uv); vertex/index buffers na VRAM; UV mapping e PBR (albedo, normal map, metallic/roughness); produto vetorial, Matriz TBN e iluminação lambertiana; matrizes Model/View/Projection, uniform buffers, normal matrix, dynamic offsets e instancing via storage buffer.*

---

> Documento de referência profunda baseado nas especificações oficiais da W3C.
