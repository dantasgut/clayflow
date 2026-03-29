# Function: LogCall()

> **LogCall**(`level`, `template`): (`_target`, `propertyKey`, `descriptor`) => `PropertyDescriptor`

Defined in: [core/debug/LogCall.ts:42](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/core/debug/LogCall.ts#L42)

Decorator de método (experimentalDecorators).
Intercepta a chamada, loga o resultado (ou erro) e o tempo de execução.
Depende de

## Parameters

### level

`LogLevel`

### template

`LogTemplate`

## Returns

(`_target`, `propertyKey`, `descriptor`) => `PropertyDescriptor`

## Loggable

na classe para acessar `this.log`.

Template placeholders:
 {0}, {1}        → argumentos posicionais
 {0.prop}        → propriedade de argumento
 {result}        → valor de retorno
 {result.length} → propriedade do retorno
 {duration}      → tempo de execução em ms (ex: "4.23ms")

## Example

```ts
// Template string
@LogCall('info', 'Inicializado — canvas {0.width}×{0.height} em {duration}')
async initialize(canvas: HTMLCanvasElement): Promise<void> { ... }

// Template função (mais tipagem, zero parsing)
@LogCall('debug', (cmd: RenderCommand) => `Pipeline — ${cmd.pipelineHashId}`)
private async createPipeline(cmd: RenderCommand): Promise<void> { ... }
```
