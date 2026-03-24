# 5. Módulo de Shaders e Compilação WGSL

O Código Fonte que a GPU executará (O Algoritmo de processamento vetorial) precisa ser compilado. A WebGPU compila textualmente e de forma estrita todo código WGSL ainda dentro do estágio de Preparação do JavaScript.

## 5.1 O GPUShaderModule 

Nós agrupamos a linguagem em um container blindado de segurança. Tentar passar WGSL inválido gerará erros massivos interceptados já nesse construtor, antes de qualquer execução visual.

```javascript
/* Passando o arquivo WGSL para o interpretador WebGPU.
Neste estágio o código é destilado do WGSL, compilado em linguagens 
secundárias base (Vulkan SPIR-V, Metal MSL, DirectX HLSL) de forma agressiva. */

const sourceCodeWGSL = `
  @vertex
  fn minha_funcao_vertice() -> @builtin(position) vec4f {
    return vec4f(0.0, 0.5, 0.0, 1.0);
  }
`;

const textModuloCompiladoTextual = device.createShaderModule({ 
   label: "Core Vertex Engine",
   code: sourceCodeWGSL 
});
```

Ao compilar o Shader, todas funções que possuem Atributos Principais (`@vertex`, `@fragment`, `@compute`) viram **Entry Points (Pontos de Entrada)** Públicos para o Pipeline. Um único Shader Module pode ter 10 fragment shaders e 5 vertex shaders diferentes. Quando criamos o Pipeline [no próximo módulo](./07_Pipeline_de_Renderizacao_e_Passes.md), devemos especificar **qual** Entry Point o Hardware invocará dali pra frente.

## 5.2 Compilação Assíncrona e "Hints" (Otimização Extrema)

A compilação natural trava a placa-mãe. Por isso, navegadores demoram para carregar jogos pesados. Existe uma promessa síncrona poderosa adicionada à especificação (Spec) chamada `compilationHints`.

Se seu pipeline invocará a entry `@vertex var_principal`, você pode passar a topologia do BindGroup (PipelineLayout) de antemão durante o load do Jogo/App para o navegador compilar nos threads da CPU assincronamente por baixo dos panos!

```javascript
const moduloAsync = device.createShaderModule({
  label: "Background Compiler",
  code: sourceCodeTrillionLineWGSL,
  compilationHints: [{
      entryPoint: 'var_principal', 
      layout: estruturaDeBindGroupDesteJogo // Um PipelineLayout previamente criado
  }]
});
```
Ao usar isso no boot da tela de *Loading...*, quando o momento do jogador invocar `device.createRenderPipeline()`, aquele gargalo massivo de travamento de frames (stutters) não existirá porque ele resgatará a *hint* cacheadamente pela V8 do Chrome!

## 5.2.1 Inspecionando Erros de Compilação

`getCompilationInfo()` retorna uma `Promise<GPUCompilationInfo>` com a lista de mensagens do compilador. Cada `GPUCompilationMessage` possui:

```typescript
{
  message: string,        // Texto do erro ou aviso
  type: "error" | "warning" | "info",
  lineNum: number,        // Linha no código WGSL (1-based)
  linePos: number,        // Coluna (1-based)
  length: number          // Extensão do token problemático
}
```

```javascript
const info = await moduloCompiladoShaderPronto.getCompilationInfo();
for (const msg of info.messages) {
  if (msg.type === 'error') {
    console.error(`WGSL erro linha ${msg.lineNum}: ${msg.message}`);
  }
}
```

## 5.3 O Universo Interno do WGSL

A sintaxe WGSL não usa classes ou métodos dinâmicos. Ela foi feita arquiteturalmente para o layout estático.
Entradas (`@location`, Recursos em `@group` e `@binding`) representam "buracos/vias", e Variáveis Uniformes são declaradas Globalmente pra todo o script.

*   `@location(N)`: Variáveis Locais Transitórias entre Vertex <-> Fragment. A cor que sai do location 0 deve entrar no location 0.
*   `@builtin(name)`: Variáveis reservadas pela Motherboard Física, exemplo: A Posição (`position`), ID de Instância Cópia (`instance_index`), e Coordenada do Mouse Pixel-Perfeito na tela final (`position` lida no Input).

[⬅ Voltar para Texturas](./04_Texturas_e_Samplers.md) | [Próximo: Resource Bindings ➡](./06_Resource_Bindings.md)
