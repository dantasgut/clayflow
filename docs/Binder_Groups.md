## BindGroups

No WebGPU, Bind Groups (grupos de vinculação) são estruturas que agrupam recursos de renderização — como buffers, texturas e samplers — para torná-los acessíveis aos shaders (vertex ou fragment) durante a execução do pipeline. 
Docs.rs
Docs.rs
Eles funcionam como um "pacote" de dados que o shader precisa para desenhar um objeto ou realizar um cálculo, sendo o mecanismo moderno (semelhante a Descriptor Sets no Vulkan) que substitui a configuração de uniformes individuais no WebGL. 
Toji.dev
Toji.dev
Principais Características e Conceitos
Conteúdo: Um Bind Group contém buffers (uniformes, armazenamento), texturas e samplers.
Organização (@group): No código WGSL (shader), eles são referenciados usando a sintaxe @group(N) @binding(M), onde N é o índice do grupo e M é a posição do recurso dentro do grupo.
Layout (@layout): Antes de criar o Bind Group, define-se um Bind Group Layout (GPUBindGroupLayout), que diz ao WebGPU qual é o tipo e a estrutura dos dados que virão no grupo.
Eficiência: A separação entre o "layout" e o "grupo" permite otimizar a renderização. Você pode alterar os dados (o conteúdo da textura ou buffer) mudando apenas o Bind Group, enquanto mantém o mesmo layout e pipeline. 
Toji.dev
Toji.dev
 +4
Exemplo de Uso
Definição no Shader (WGSL):
wgsl
@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var myTexture : texture_2d<f32>;
@group(1) @binding(1) var mySampler : sampler;
Criação no JS:
javascript
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: cameraBuffer } }
  ],
});
Uso no Render Pass:
javascript
passEncoder.setBindGroup(0, bindGroup);
Vantagens
Menos custo na GPU: Ao pré-agrupar recursos, a GPU realiza menos verificações no momento do desenho, resultando em melhor desempenho em comparação ao WebGL.
Organização de Materiais: Permite separar dados globais (câmera no grupo 0) de dados específicos de objetos (texturas/materiais no grupo 1), facilitando a renderização eficiente de múltiplos objetos. uais no WebGL.