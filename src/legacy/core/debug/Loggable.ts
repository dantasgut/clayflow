import { Logger } from './Logger';

/**
 * Decorator de classe (legacy experimentalDecorators).
 * Injeta a propriedade `log: Logger` via getter lazy no prototype.
 * Compatível com construtores private (Singletons) e public.
 *
 * Aceita um nome de canal explícito para evitar minificação em builds:
 *   @Loggable('WebGPURenderer')
 *
 * Ou sem argumento, usando o nome da classe (legível apenas em dev):
 *   @Loggable
 *
 * @example
 * @Loggable('WebGPURenderer')
 * class WebGPURenderer {
 *     declare protected readonly log: Logger;
 *
 *     initialize() {
 *         this.log.info('Renderer inicializado');
 *     }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function applyLoggable(target: Function, channel: string): void {
    Object.defineProperty(target.prototype, 'log', {
        get(this: object) {
            const logger = Logger.create(channel);
            // Substitui o getter por valor fixo na instância (uma só criação)
            Object.defineProperty(this, 'log', {
                value:        logger,
                writable:     false,
                configurable: false,
                enumerable:   false,
            });
            return logger;
        },
        configurable: true,
        enumerable:   false,
    });
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export function Loggable(targetOrName: Function | string): any {
    // @Loggable  (sem argumento — usa target.name)
    if (typeof targetOrName === 'function') {
        applyLoggable(targetOrName, targetOrName.name);
        return;
    }
    // @Loggable('NomeExplicito')  (com argumento — retorna decorator)
    const channel = targetOrName;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    return (target: Function): void => applyLoggable(target, channel);
}
