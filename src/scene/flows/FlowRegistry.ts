import type { EngineCore } from '../../core/contracts/index';
import type { ResourceDirectory } from '../contracts/ResourceDirectory';
import type { EventBus, Unsubscribe } from '../events/EventBus';
import type { World } from '../world/World';
import { Flow } from './Flow';
import { LegacyFlow } from './LegacyFlow';
import { PHASE_ORDER, type Phase } from './Phase';

/** O que uma factory recebe para construir o Flow. */
export interface FlowContext {
    readonly core: EngineCore;
    readonly world: World;
    readonly resources: ResourceDirectory;
    readonly events: EventBus;
    /** Tipo de corpo (chave do pool) da instância, nos registros com `bodyType`. */
    readonly bodyType?: string;
}

/** Construtor de um Flow, chamado pela C2 quando o Flow é necessário. */
export type FlowFactory<F extends Flow = Flow> = (ctx: FlowContext) => F;

/** Opções de registro (a ordem do quadro e a seleção vêm daqui, não do Flow). */
export interface RegisterOptions {
    /** Nome do estágio (único na fase). */
    readonly type: string;
    readonly phase: Phase;
    /**
     * Chave do pool atendido (`schema.name`, ou `schema.name:algoritmo` com `FlowDescriptor`). Com `bodyType`, a C2
     * instancia o Flow quando o pool passa a existir (primeiro corpo), uma instância por `bodyType`; sem `bodyType`,
     * o Flow é instanciado no registro.
     */
    readonly bodyType?: string;
    /** Maior roda antes na fase e vence na seleção do `bodyType`. Default 0. */
    readonly priority?: number;
}

/** Erro de registro: `type` repetido na fase, `bodyType` vazio. */
export class FlowRegistrationError extends Error {
    override readonly name = 'FlowRegistrationError';
}

/** Quem aloca os Flows (o `ResourceSystem` da cena). */
export interface FlowAllocator {
    /** Resolve slots, prepara pipelines e emite `flowReady` quando o Flow fica pronto. */
    ensureFlowAllocated(flow: Flow, options: RegisterOptions): void;
    /** Libera o que a C2 criou para o Flow e o descarta. */
    releaseFlow(flow: Flow): void;
    /** O pool já existe? */
    hasPool(poolKey: string): boolean;
}

/** Contexto e alocador da cena, ligados na criação da cena. */
export interface FlowRegistryHost {
    readonly context: Omit<FlowContext, 'bodyType'>;
    readonly allocator: FlowAllocator;
}

/** Um registro (factory + opções) e a instância corrente, quando existe. */
export interface FlowRegistration<F extends Flow = Flow> {
    readonly options: Required<Omit<RegisterOptions, 'bodyType'>> & { readonly bodyType?: string };
    readonly factory: FlowFactory<F>;
    /** Instância atual (sem `bodyType`: desde o registro; com `bodyType`: quando o pool existe e o registro vence). */
    readonly flow: F | undefined;
    /** Substituição explícita do `bodyType` (`override`), que vence a prioridade. */
    readonly override: boolean;
}

interface MutableRegistration extends FlowRegistration {
    flow: Flow | undefined;
    readonly order: number;
}

interface LegacyEntry {
    readonly flow: LegacyFlow;
    readonly priority: number;
    readonly order: number;
}

/** Um estágio ordenado da fase: Flow do modelo de slots ou estágio de migração. */
export type PhaseEntry = Flow | LegacyFlow;

/**
 * Registro dos estágios da cena, por factory. A ordem do quadro é a regra única do documento: fases fixas
 * (`PHASE_ORDER`); dentro da fase, `priority` decrescente; empate pela ordem de registro. A seleção do Flow de um tipo
 * de corpo segue a mesma regra: `override` → maior `priority` → último registrado.
 *
 * Registros com `bodyType` não instanciam nada até o pool existir; a C2 (`ResourceSystem`) emite `poolCreated` e o
 * registro instancia o vencedor, que é alocado (`ensureFlowAllocated`) e só entra no quadro depois de `flowReady`.
 */
export class FlowRegistry {
    private readonly registrations: MutableRegistration[] = [];
    private readonly legacy: LegacyEntry[] = [];
    private readonly subscriptions: Unsubscribe[] = [];
    private order = 0;

    constructor(private readonly host?: FlowRegistryHost) {
        if (host !== undefined) {
            this.subscriptions.push(
                host.context.events.on('poolCreated', (e) => {
                    this.refreshBodyType(e.poolKey);
                }),
            );
        }
    }

    /**
     * Registra uma factory. Sem `bodyType`, instancia e aloca agora; com `bodyType`, instancia quando o pool existir
     * e o registro vencer a seleção.
     * @throws FlowRegistrationError se `type` já está registrado na fase ou `bodyType` é vazio.
     */
    register<F extends Flow>(
        factory: FlowFactory<F>,
        options: RegisterOptions,
    ): FlowRegistration<F>;
    /**
     * Estágio do contrato anterior (base de migração da spec 006); sai quando o último estágio migrar.
     * @deprecated Use o registro por factory.
     */
    register(flow: LegacyFlow): void;
    register<F extends Flow>(
        arg: FlowFactory<F> | LegacyFlow,
        options?: RegisterOptions,
    ): FlowRegistration<F> | undefined {
        if (arg instanceof LegacyFlow) {
            this.legacy.push({ flow: arg, priority: arg.priority, order: this.order++ });
            return undefined;
        }
        return this.add(arg, options!, false) as FlowRegistration<F>;
    }

    /**
     * Substitui o Flow de `bodyType`: o registro vence a prioridade dos demais para esse tipo de corpo.
     */
    override<F extends Flow>(
        bodyType: string,
        factory: FlowFactory<F>,
        options: Omit<RegisterOptions, 'bodyType'>,
    ): FlowRegistration<F> {
        return this.add(factory, { ...options, bodyType }, true) as FlowRegistration<F>;
    }

    /**
     * Remove um registro (ou estágio de migração): descarta a instância (objetos de GPU, inscrições, compilação em
     * curso) e, para `bodyType`, instancia o próximo vencedor. Devolve `false` se não estava registrado.
     */
    unregister(registration: FlowRegistration | LegacyFlow): boolean {
        if (registration instanceof LegacyFlow) {
            const index = this.legacy.findIndex((e) => e.flow === registration);
            if (index < 0) return false;
            this.legacy.splice(index, 1);
            registration.dispose();
            return true;
        }
        const index = this.registrations.indexOf(registration as MutableRegistration);
        if (index < 0) return false;
        const reg = this.registrations[index]!;
        this.registrations.splice(index, 1);
        this.release(reg);
        if (reg.options.bodyType !== undefined) this.refreshBodyType(reg.options.bodyType);
        return true;
    }

    /** Registro que atende `bodyType`: override → maior prioridade → último registrado. */
    resolve(bodyType: string): FlowRegistration | undefined {
        let best: MutableRegistration | undefined;
        for (const reg of this.registrations) {
            if (reg.options.bodyType !== bodyType) continue;
            if (best === undefined || this.beats(reg, best)) best = reg;
        }
        return best;
    }

    /**
     * Estágio de migração que atende `bodyType`, pela mesma regra.
     * @deprecated Base de migração (spec 006).
     */
    resolveLegacy(bodyType: string): LegacyFlow | undefined {
        let best: LegacyEntry | undefined;
        for (const e of this.legacy) {
            if (e.flow.bodyType !== bodyType) continue;
            if (best === undefined || e.priority >= best.priority) best = e;
        }
        return best?.flow;
    }

    /** Todos os registros, na ordem de registro. */
    allRegistrations(): readonly FlowRegistration[] {
        return [...this.registrations];
    }

    /** Instâncias existentes na fase, na ordem do quadro. */
    flowsInPhase(phase: Phase): readonly Flow[] {
        return this.phaseEntries(phase).filter((e): e is Flow => e instanceof Flow);
    }

    /** Estágios da fase (Flows e estágios de migração), na ordem do quadro. */
    phaseEntries(phase: Phase): readonly PhaseEntry[] {
        const entries: { entry: PhaseEntry; priority: number; order: number }[] = [];
        for (const reg of this.registrations) {
            if (reg.options.phase !== phase || reg.flow === undefined) continue;
            entries.push({ entry: reg.flow, priority: reg.options.priority, order: reg.order });
        }
        for (const e of this.legacy) {
            if (e.flow.phase !== phase) continue;
            entries.push({ entry: e.flow, priority: e.priority, order: e.order });
        }
        entries.sort((a, b) => b.priority - a.priority || a.order - b.order);
        return entries.map((e) => e.entry);
    }

    /** Ordem fixa das fases. */
    phasesInOrder(): readonly Phase[] {
        return PHASE_ORDER;
    }

    /** Todos os estágios instanciados, na ordem do quadro. */
    *allFlows(): IterableIterator<PhaseEntry> {
        for (const phase of PHASE_ORDER) yield* this.phaseEntries(phase);
    }

    /** Desregistra tudo e desfaz as inscrições (descarte da cena). */
    dispose(): void {
        for (const reg of [...this.registrations]) {
            this.registrations.splice(this.registrations.indexOf(reg), 1);
            this.release(reg);
        }
        for (const e of [...this.legacy]) this.unregister(e.flow);
        for (const off of this.subscriptions) off();
        this.subscriptions.length = 0;
    }

    private add(
        factory: FlowFactory,
        options: RegisterOptions,
        override: boolean,
    ): FlowRegistration {
        if (options.bodyType?.length === 0) {
            throw new FlowRegistrationError(`FlowRegistry: '${options.type}' com bodyType vazio.`);
        }
        const clash = this.registrations.find(
            (r) =>
                r.options.type === options.type
                && r.options.phase === options.phase
                && r.options.bodyType === options.bodyType,
        );
        if (clash !== undefined) {
            throw new FlowRegistrationError(
                `FlowRegistry: '${options.type}' já registrado na fase '${options.phase}'${options.bodyType !== undefined ? ` para '${options.bodyType}'` : ''}.`,
            );
        }
        const reg: MutableRegistration = {
            options: {
                type: options.type,
                phase: options.phase,
                priority: options.priority ?? 0,
                ...(options.bodyType !== undefined ? { bodyType: options.bodyType } : {}),
            },
            factory,
            flow: undefined,
            override,
            order: this.order++,
        };
        this.registrations.push(reg);
        if (reg.options.bodyType === undefined) this.instantiate(reg);
        else this.refreshBodyType(reg.options.bodyType);
        return reg;
    }

    /** `a` vence `b` na seleção do bodyType. */
    private beats(a: MutableRegistration, b: MutableRegistration): boolean {
        if (a.override !== b.override) return a.override;
        if (a.options.priority !== b.options.priority)
            return a.options.priority > b.options.priority;
        return a.order > b.order;
    }

    /** Garante que só o vencedor de `bodyType` está instanciado, e só se o pool existe. */
    private refreshBodyType(bodyType: string): void {
        const host = this.host;
        if (host === undefined) return;
        const winner = this.resolve(bodyType) as MutableRegistration | undefined;
        for (const reg of this.registrations) {
            if (reg.options.bodyType === bodyType && reg !== winner && reg.flow !== undefined) {
                this.release(reg);
            }
        }
        if (winner !== undefined && winner.flow === undefined && host.allocator.hasPool(bodyType)) {
            this.instantiate(winner);
        }
    }

    private instantiate(reg: MutableRegistration): void {
        const host = this.host;
        if (host === undefined) {
            throw new FlowRegistrationError(
                `FlowRegistry: '${reg.options.type}' registrado sem cena (crie o registro por createScene).`,
            );
        }
        const flow = reg.factory({
            ...host.context,
            ...(reg.options.bodyType !== undefined ? { bodyType: reg.options.bodyType } : {}),
        });
        reg.flow = flow;
        host.allocator.ensureFlowAllocated(flow, reg.options);
    }

    private release(reg: MutableRegistration): void {
        if (reg.flow === undefined) return;
        const flow = reg.flow;
        reg.flow = undefined;
        this.host?.allocator.releaseFlow(flow);
    }
}
