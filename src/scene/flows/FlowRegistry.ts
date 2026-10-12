import type { Flow, Phase } from './Flow';

interface RegisteredFlow {
    readonly flow: Flow;
    readonly priority: number;
}

/**
 * Ordem fixa de phases dentro de um frame. ExecutionSystem itera sobre
 * essa ordem e despacha flows de cada phase.
 */
const PHASE_ORDER: readonly Phase[] = ['physics', 'transform', 'shadow', 'forward', 'post', 'ui'];

/**
 * FlowRegistry mantém os Flows ativos do scene, indexados por phase e
 * (opcionalmente) por bodyType.
 *
 * Ordem (definição única do documento de arquitetura): fases fixas (`PHASE_ORDER`); dentro da fase, `priority`
 * decrescente, empate pela ordem de registro. `resolve(bodyType)` segue a mesma regra: o Flow de maior `priority` para
 * o bodyType, empate para o último registrado; um `override` explícito vence todos.
 */
export class FlowRegistry {
    private readonly byPhase = new Map<Phase, RegisteredFlow[]>();
    /** Flows de cada bodyType, na ordem de registro. */
    private readonly byBodyType = new Map<string, Flow[]>();
    /** Substituições explícitas (`override`), que vencem a prioridade. */
    private readonly overrides = new Map<string, Flow>();

    /**
     * Adiciona um flow ao registry. Se `flow.bodyType` é não-vazio, entra entre os candidatos de `resolve()`. Vários
     * flows com o mesmo bodyType rodam todos; `resolve` escolhe pela prioridade (use `override()` para substituir).
     */
    register(flow: Flow): void {
        this.addToPhase(flow);
        if (flow.bodyType.length > 0) {
            this.byBodyType.set(flow.bodyType, [
                ...(this.byBodyType.get(flow.bodyType) ?? []),
                flow,
            ]);
        }
    }

    /**
     * Substitui o flow responsável por `bodyType` — remove o anterior da
     * phase array e registra o novo. Use para hot-swap em dev mode ou
     * para apps que querem behavior diferente do default (e.g. trocar
     * LCPFlow por solver custom).
     */
    override(bodyType: string, flow: Flow): void {
        const previous = this.resolve(bodyType);
        if (previous !== undefined) {
            this.removeFromPhase(previous);
            this.forgetBodyType(previous);
        }
        this.overrides.set(bodyType, flow);
        this.addToPhase(flow);
    }

    /**
     * Remove `flow` do registry (fase e índice por bodyType) e o descarta (`flow.dispose()`). Devolve `false` se o
     * flow não estava registrado (nada é descartado).
     */
    unregister(flow: Flow): boolean {
        if (!this.removeFromPhase(flow)) return false;
        this.forgetBodyType(flow);
        flow.dispose();
        return true;
    }

    /**
     * Flow responsável por um bodyType: o `override` se houver; senão o de maior `priority`, empate para o último
     * registrado. Undefined se nenhum.
     */
    resolve(bodyType: string): Flow | undefined {
        const overridden = this.overrides.get(bodyType);
        if (overridden !== undefined) return overridden;
        let best: Flow | undefined;
        for (const flow of this.byBodyType.get(bodyType) ?? []) {
            if (best === undefined || flow.priority >= best.priority) best = flow;
        }
        return best;
    }

    /** Lista todos os Flows na `phase` (independente de isReady). */
    flowsInPhase(phase: Phase): readonly Flow[] {
        return (this.byPhase.get(phase) ?? []).map((r) => r.flow);
    }

    /** Filtra `flowsInPhase` para retornar só os com `isReady() === true`. */
    activeFlowsInPhase(phase: Phase): readonly Flow[] {
        return this.flowsInPhase(phase).filter((f) => f.isReady());
    }

    /** Retorna a ordem fixa das phases (constante por design). */
    phasesInOrder(): readonly Phase[] {
        return PHASE_ORDER;
    }

    /** Insere na fase mantendo `priority` decrescente; `sort` estável preserva a ordem de registro nos empates. */
    private addToPhase(flow: Flow): void {
        const arr = this.byPhase.get(flow.phase) ?? [];
        arr.push({ flow, priority: flow.priority });
        arr.sort((a, b) => b.priority - a.priority);
        this.byPhase.set(flow.phase, arr);
    }

    private removeFromPhase(flow: Flow): boolean {
        const arr = this.byPhase.get(flow.phase);
        const index = arr?.findIndex((r) => r.flow === flow) ?? -1;
        if (arr === undefined || index < 0) return false;
        arr.splice(index, 1);
        return true;
    }

    private forgetBodyType(flow: Flow): void {
        for (const [bodyType, flows] of this.byBodyType) {
            const rest = flows.filter((f) => f !== flow);
            if (rest.length === 0) this.byBodyType.delete(bodyType);
            else if (rest.length !== flows.length) this.byBodyType.set(bodyType, rest);
        }
        for (const [bodyType, overridden] of this.overrides) {
            if (overridden === flow) this.overrides.delete(bodyType);
        }
    }

    /** Iterator sobre todos os Flows registrados em ordem (phase × priority). */
    *allFlows(): IterableIterator<Flow> {
        for (const phase of PHASE_ORDER) {
            for (const reg of this.byPhase.get(phase) ?? []) {
                yield reg.flow;
            }
        }
    }
}
