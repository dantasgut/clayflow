/**
 * SolverRegistry — registro Singleton de factories de solvers de física rígida.
 *
 * Implementa o padrão Registry+Strategy (GoF): mapeia ResolutionType (+ backend)
 * para uma função de fábrica que instancia o ISolver correto.
 *
 * Uso:
 *   SolverRegistry.getInstance().register('gpu_lcp', (cfg) => new GpuSolverAdapter(cfg));
 *   const solver = SolverRegistry.getInstance().create('gpu_lcp', config);
 *
 * Arquitetura: Layer 3 (elements/physics/solvers).
 */

import type { ISolver }             from './ISolver';
import type { RigidBodySimConfig }  from '../../../scene/systems/simulation/RigidBodySimConfig';

/** Chave de registro: combina tipo de resolução + backend para unicidade. */
export type SolverKey = string;

/** Função de fábrica: recebe a config do pipeline e devolve um ISolver pronto. */
export type SolverFactory = (config: RigidBodySimConfig) => ISolver;

export class SolverRegistry {

    private static _instance: SolverRegistry | null = null;

    private readonly factories = new Map<SolverKey, SolverFactory>();

    private constructor() {}

    /** Retorna a instância Singleton do registry. */
    public static getInstance(): SolverRegistry {
        if (!SolverRegistry._instance) {
            SolverRegistry._instance = new SolverRegistry();
        }
        return SolverRegistry._instance;
    }

    /**
     * Registra uma factory para uma chave de solver.
     * Sobrescreve silenciosamente se a chave já existir.
     *
     * @param key     Identificador único do solver (ex: 'gpu_lcp', 'cpu_si').
     * @param factory Função que instancia o ISolver dado o config.
     */
    public register(key: SolverKey, factory: SolverFactory): void {
        this.factories.set(key, factory);
    }

    /**
     * Instancia um solver a partir da chave registrada.
     * Lança RangeError se a chave não estiver registrada.
     *
     * @param key    Identificador do solver.
     * @param config Configuração do pipeline de corpos rígidos.
     */
    public create(key: SolverKey, config: RigidBodySimConfig): ISolver {
        const factory = this.factories.get(key);
        if (!factory) {
            throw new RangeError(
                `[SolverRegistry] solver '${key}' não registrado. ` +
                `Disponíveis: [${[...this.factories.keys()].join(', ')}]`,
            );
        }
        return factory(config);
    }

    /** Verifica se uma chave está registrada. */
    public has(key: SolverKey): boolean {
        return this.factories.has(key);
    }

    /** Reseta o registry (útil em testes). */
    public clear(): void {
        this.factories.clear();
    }
}
