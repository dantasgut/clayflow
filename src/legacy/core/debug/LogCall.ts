import type { Logger } from './Logger';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/**
 * Template como string com placeholders ou função.
 * Na forma função, `this` é o contexto da instância — permite acessar estado interno.
 *   (cmd: RenderCommand) => `Pipeline — ${cmd.pipelineHashId}`
 *   function() { return `Bodies: ${this.bodies.size}`; }  ← usa this da instância
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LogTemplate = string | ((this: any, ...args: unknown[]) => string);

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Interface mínima esperada no `this` da classe decorada (injetada por @Loggable)
interface WithLogger { log: Logger }

// ── Decorator ────────────────────────────────────────────────────────────────

/**
 * Decorator de método (experimentalDecorators).
 * Intercepta a chamada, loga o resultado (ou erro) e o tempo de execução.
 * Depende de @Loggable na classe para acessar `this.log`.
 *
 * Template placeholders:
 *  {0}, {1}        → argumentos posicionais
 *  {0.prop}        → propriedade de argumento
 *  {result}        → valor de retorno
 *  {result.length} → propriedade do retorno
 *  {duration}      → tempo de execução em ms (ex: "4.23ms")
 *
 * @example
 * // Template string
 * @LogCall('info', 'Inicializado — canvas {0.width}×{0.height} em {duration}')
 * async initialize(canvas: HTMLCanvasElement): Promise<void> { ... }
 *
 * // Template função (mais tipagem, zero parsing)
 * @LogCall('debug', (cmd: RenderCommand) => `Pipeline — ${cmd.pipelineHashId}`)
 * private async createPipeline(cmd: RenderCommand): Promise<void> { ... }
 */
export function LogCall(level: LogLevel, template: LogTemplate) {
    return function (
        _target:      object,
        propertyKey:  string | symbol,
        descriptor:   PropertyDescriptor,
    ): PropertyDescriptor {
        const original   = descriptor.value as (...args: unknown[]) => unknown;
        const methodName = String(propertyKey);

        descriptor.value = function (this: WithLogger, ...args: unknown[]) {
            const start  = performance.now();
            let   result: unknown;

            try {
                result = original.apply(this, args);
            } catch (err) {
                this.log.error(`${methodName} — falhou após ${elapsed(start)}`, err);
                throw err;
            }

            // Método assíncrono
            if (result instanceof Promise) {
                return result
                    .then((value: unknown) => {
                        this.log[level](render(template, methodName, args, value, elapsed(start), this));
                        return value;
                    })
                    .catch((err: unknown) => {
                        this.log.error(`${methodName} — falhou após ${elapsed(start)}`, err);
                        throw err;
                    });
            }

            // Método síncrono
            this.log[level](render(template, methodName, args, result, elapsed(start), this));
            return result;
        };

        return descriptor;
    };
}

// ── Utilitários internos ─────────────────────────────────────────────────────

function elapsed(start: number): string {
    return `${(performance.now() - start).toFixed(2)}ms`;
}

function render(
    template: LogTemplate,
    _method:  string,
    args:     unknown[],
    result:   unknown,
    duration: string,
    ctx:      unknown,
): string {
    if (typeof template === 'function') {
        return template.call(ctx, ...args);
    }

    return template.replace(/\{([^}]+)\}/g, (match, expr: string) => {
        if (expr === 'duration') return duration;
        if (expr === 'result')   return print(result);

        if (expr.startsWith('result.')) {
            return walk(result, expr.slice(7).split('.'));
        }

        // posicional: "0", "1", "0.prop", "1.a.b"
        const [head, ...tail] = expr.split('.');
        const idx = parseInt(head ?? '', 10);
        if (!isNaN(idx)) {
            return tail.length > 0 ? walk(args[idx], tail) : print(args[idx]);
        }

        return match; // placeholder desconhecido — deixa literal
    });
}

function walk(obj: unknown, path: string[]): string {
    let cur = obj;
    for (const key of path) {
        if (cur == null) return 'null';
        cur = (cur as Record<string, unknown>)[key];
    }
    return print(cur);
}

function print(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (Array.isArray(value))                  return `Array(${value.length})`;
    if (typeof value === 'object')             return value.constructor?.name ?? 'Object';
    return String(value);
}
