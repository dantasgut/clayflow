## Núcleo

1. GPU (Ponto de entrada)

    * navigator.gpu 
    * Permite solicitar um adapter (representação de uma GPU disponível no sistema)

    > ```const adapter = await navigator.gpu.requestAdapter();```

2. GPUAdapter
    Representa uma GPU física ou lógica disponível

    * Consulta de recursos e limites
    * Solicita um GPUDevice

    >```const device = await adapter.requestDevice();```


3. GPUDevice (Núcleo do WebGPU)
    É o componente central

    A partir dele você cria praticamente tudo:

    * Buffers
    * Shaders
    * Pipelines
    * Command encoders
    * Bind groups
    * Textures

    Ele também contém a queue para envio de comandos à GPU<br/>

4. GPUQueue

    * Responsável por enviar comandos para execução na GPU.
    * Submete command buffers

    > ```device.queue.submit([commandBuffer])```

## Timelines (O Modelo de Execução)

A WebGPU opera em duas linhas do tempo paralelas. Essa separação é o que permite que o JavaScript continue rodando enquanto a GPU processa tarefas pesadas em segundo plano.

5. Content Timeline (Linha do Tempo do Conteúdo)
    É o "lado da CPU", onde o seu código JavaScript reside.

    * **O que acontece aqui:**
        * **Definição:** Criação de objetos (Buffers, Texturas) e configuração de Pipelines.
        * **Gravação:** Registro de comandos no `GPUCommandEncoder`.
    * **Comportamento:** É uma linha do tempo de **agendamento**. Você está montando o "roteiro" (Command Buffer). O JS apenas despacha essas ordens e segue adiante.

6. Device Timeline (Linha do Tempo do Dispositivo)
    É o "lado da GPU", onde o hardware executa o trabalho seguindo o ciclo de vida dos dados.

    * **O que acontece aqui (O Ciclo de Execução):**
        1. **Entrada (Input):** A GPU acessa os dados brutos nos Buffers e Texturas.
        2. **Processamento (Shaders):** O hardware executa os programas (WGSL) para transformar os dados:
            * **Vertex Shaders:** Cálculos de posicionamento de geometria.
            * **Compute Shaders:** Cálculos matemáticos genéricos e processamento de dados.
            * **Fragment Shaders:** Cálculos de cor e iluminação por pixel.
        3. **Saída (Output):** Escrita dos resultados finais no Canvas (pixels) ou em Buffers de destino.
    * **Comportamento:** É uma linha do tempo de **consumo**. Ela processa os pacotes enviados via `queue.submit()` de forma independente.



7. Sincronização (A Ponte)
    Como as duas linhas rodam em tempos diferentes, existem pontos de coordenação:

    * **Submissão (`submit`):** O ponto em que o trabalho sai da *Content Timeline* e entra na fila da *Device Timeline*.
    * **Mapeamento (`mapAsync`):** Quando o JS solicita ler um buffer que a GPU processou. A Promise resolve na *Content Timeline* apenas quando a *Device Timeline* encerra a escrita.
    * **Trabalho Concluído (`onSubmittedWorkDone`):** Promise que notifica o JS quando a GPU finalizou todo o ciclo de execução anterior.

    > **Regra de Ouro:**
    > A *Content Timeline* nunca espera pela *Device Timeline* de forma síncrona. Toda comunicação de volta para o JS é feita através de Promises para evitar travamentos.


## Recursos (Resources)

São os dados que a GPU usa.

5. Buffers ( GPUBuffer )
    * Armazenam:
        * Vértices
        * Índices
        * Uniforms
        * Storage data<br/><br/>
    * Podem ser:
        * VERTEX
        * INDEX
        * UNIFORM
        * STORAGE
        * COPY SRC, COPY DST

6. Textures ( GPUTexture)
    * Imagens 2D/3D 
    * Render targets 
    * Depth buffers
    * Cubemaps
    * A partir delas você cria:
        * GPUTextureView

7. Samplers ( GPUSampler )
    * Definem como texturas são amostradas: 
    * Filtering 
    * Wrapping 
    * Mipmapping

## Shaders e Pipeline

8. Shaders (WGSL)

    Escritos em WGSL (WebGPU Shading Language) Tipos principais:<br/>
    * Vertex shader 
    * Fragment shader
    * Compute shader


9. Bind Groups
    Organizam o acesso a recursos dentro do shader
    Componentes relacionados.<br/>

    * GPUBindGroupLayout
    * GPUBindGroup

    Eles definem como buffers, texturas e samplers são expostos ae shader.

10. Pipeline
    Define como a GPU processa dados.
    Tipos:

    * GPURenderPipeline
    * Vertex + Fragment
    * Configurações de rasterização
    * Blend
    * Depth test
    * GPUComputePipeline
    * Apenas compute shader

    Pipeline é essencialmente: 

    * Estado + Shaders + Layout de recursos

## Sistema de Comandos (Fluxo de Trabalho)

A WebGPU utiliza um modelo de "gravação e submissão". Em vez de enviar ordens isoladas, você registra um roteiro completo de execução para que a GPU o processe de forma otimizada.

11. **Command Encoder** (`GPUCommandEncoder`)
    O objeto responsável por abrir a sessão de gravação e traduzir chamadas JavaScript em instruções de hardware.
    > ```const encoder = device.createCommandEncoder();```

12. **Passes** (Contextos de Gravação)
    Toda operação deve ocorrer dentro de um escopo específico de "Pass", que define o estado inicial e os alvos (targets) da operação:
    * **`GPURenderPassEncoder`**: Voltado ao pipeline gráfico (desenho de triângulos, rasterização). Define onde os pixels serão escritos e se o alvo deve ser limpo antes do início.
    * **`GPUComputePassEncoder`**: Voltado a cálculos matemáticos e processamento de dados genéricos via Compute Shaders.

13. **Command Buffer**
    Um objeto imutável que contém a lista final de instruções gravadas. Ele é gerado ao finalizar o encoder e representa o "pacote" pronto para o hardware.
    > ```const commandBuffer = encoder.finish();```

14. **Submissão** (`GPUQueue`)
    O passo crucial de execução. O Command Buffer é enviado para a fila (Queue) da GPU, movendo o trabalho da **Content Timeline** para a **Device Timeline**.
    > ```device.queue.submit([commandBuffer]);```

## Canvas e Contexto

14. GPUCanvasContext
    Conecta o WebGPU ao canvas

    > ```const context = canvas.getContext("webgpu")```
    * Configura formato
    * Obtém textura atual para renderização

## Estrutura Mental Simplificada

Podemos resumir o WebGPU em 4 blocos principais:

1. Device -> cria tudo
2. Resources - buffers, textures, samplers 
3. Pipeline - shaders + estado 
4. Commands - encoder - passes - queue