import { LogLevel } from './LogLevel';

// ── Estilos CSS para o console do browser ────────────────────────────────────
const STYLES: Record<string, string> = {
    DEBUG:   'color:#94a3b8',
    INFO:    'color:#38bdf8',
    WARN:    'color:#fb923c; font-weight:bold',
    ERROR:   'color:#f87171; font-weight:bold',
    CHANNEL: 'color:#cbd5e1; font-weight:bold',
    RESET:   'color:inherit',
};

// ── Auto-detecção de nível via localStorage ───────────────────────────────────
// No console do browser, sem alterar código:
//   localStorage.setItem('webgpu:loglevel', 'debug')  → ativa DEBUG global
//   localStorage.removeItem('webgpu:loglevel')         → volta para INFO
const STORAGE_KEY = 'webgpu:loglevel';
const LEVEL_MAP: Record<string, LogLevel> = {
    debug:  LogLevel.DEBUG,
    info:   LogLevel.INFO,
    warn:   LogLevel.WARN,
    error:  LogLevel.ERROR,
    silent: LogLevel.SILENT,
};

function resolveInitialLevel(): LogLevel {
    try {
        const stored = localStorage.getItem(STORAGE_KEY)?.toLowerCase();
        if (stored && stored in LEVEL_MAP) return LEVEL_MAP[stored]!;
    } catch { /* ambiente sem localStorage (SSR, workers) */ }
    return LogLevel.INFO;
}

/**
 * Logger leve com saída formatada e controle de nível por canal.
 *
 * Controle via código:
 *   Logger.setGlobalLevel(LogLevel.DEBUG);
 *
 * Controle via console do browser (sem tocar no código):
 *   localStorage.setItem('webgpu:loglevel', 'debug')   // ativa debug
 *   localStorage.removeItem('webgpu:loglevel')          // volta ao padrão
 *   — recarregue a página após alterar —
 *
 * Uso via decorator:
 *   @Loggable
 *   class Foo { declare protected readonly log: Logger; }
 */
export class Logger {
    private static globalLevel: LogLevel = resolveInitialLevel();
    private static readonly registry     = new Map<string, Logger>();

    private channelLevel: LogLevel | null = null;

    private constructor(private readonly channel: string) {}

    // ── Fábrica ──────────────────────────────────────────────────────────────

    /** Retorna (ou cria) o Logger do canal. Canais são singletons por nome. */
    public static create(channel: string): Logger {
        let logger = Logger.registry.get(channel);
        if (!logger) {
            logger = new Logger(channel);
            Logger.registry.set(channel, logger);
        }
        return logger;
    }

    // ── Controle de nível ────────────────────────────────────────────────────

    /** Define o nível mínimo global (todos os canais sem override individual). */
    public static setGlobalLevel(level: LogLevel): void {
        Logger.globalLevel = level;
    }

    /** Silencia ou reativa globalmente. Atalho para SILENT / INFO. */
    public static setEnabled(enabled: boolean): void {
        Logger.globalLevel = enabled ? LogLevel.INFO : LogLevel.SILENT;
    }

    /** Override de nível para este canal específico. */
    public setLevel(level: LogLevel): this {
        this.channelLevel = level;
        return this;
    }

    private get activeLevel(): LogLevel {
        return this.channelLevel ?? Logger.globalLevel;
    }

    // ── Saída ────────────────────────────────────────────────────────────────

    public debug(msg: string, ...data: unknown[]): void {
        if (this.activeLevel <= LogLevel.DEBUG) this.print('DEBUG', msg, data);
    }

    public info(msg: string, ...data: unknown[]): void {
        if (this.activeLevel <= LogLevel.INFO) this.print('INFO', msg, data);
    }

    public warn(msg: string, ...data: unknown[]): void {
        if (this.activeLevel <= LogLevel.WARN) this.print('WARN', msg, data);
    }

    public error(msg: string, ...data: unknown[]): void {
        if (this.activeLevel <= LogLevel.ERROR) this.print('ERROR', msg, data);
    }

    // ── Formatação ───────────────────────────────────────────────────────────

    private print(level: string, msg: string, data: unknown[]): void {
        const time    = new Date().toISOString().slice(11, 23);      // HH:MM:SS.mmm
        const lvlPad  = level.padEnd(5);
        const chanPad = this.channel.padEnd(20);

        const template = `%c${time} %c${lvlPad}%c ${chanPad} » ${msg}`;
        const styles   = [STYLES['RESET']!, STYLES[level]!, STYLES['CHANNEL']!];

        const fn = level === 'ERROR' ? console.error
                 : level === 'WARN'  ? console.warn
                 : level === 'DEBUG' ? console.debug
                 :                     console.info;

        if (data.length > 0) {
            fn(template, ...styles, ...data);
        } else {
            fn(template, ...styles);
        }
    }
}
