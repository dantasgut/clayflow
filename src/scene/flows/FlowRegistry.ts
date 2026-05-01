import type { Flow, Phase } from './Flow';

interface RegisteredFlow {
    readonly flow: Flow;
    readonly priority: number;
}

/**
 * Ordem fixa de phases dentro de um frame. ExecutionSystem itera sobre
 * essa ordem e despacha flows de cada phase.
 */
const PHASE_ORDER: readonly Phase[] = ['physics', 'shadow', 'forward', 'post', 'ui'];

/**
 * FlowRegistry mantém os Flows ativos do scene, indexados por phase e
 * (opcionalmente) por bodyType. Múltiplos Flows na mesma phase são
 * ordenados por priority decrescente.
 *
 * `bodyType` index permite resolver "qual Flow é responsável por
 * RigidBody:LCP?" — usado por Resources que declaram FlowDescriptors
 * para auto-roteamento.
 */
export class FlowRegistry {
    private readonly byPhase = new Map<Phase, RegisteredFlow[]>();
    private readonly byBodyType = new Map<string, Flow>();

    /**
     * Adiciona um flow ao registry. Se `flow.bodyType` é não-vazio, indexa
     * para resolve(). Múltiplos registers com mesmo bodyType: o último vence
     * no índice mas todos rodam (use `override()` para substituir explicitamente).
     */
    register(flow: Flow): void {
        const arr = this.byPhase.get(flow.phase) ?? [];
        arr.push({ flow, priority: flow.priority });
        arr.sort((a, b) => b.priority - a.priority);
        this.byPhase.set(flow.phase, arr);
        if (flow.bodyType.length > 0) {
            this.byBodyType.set(flow.bodyType, flow);
        }
    }

    /**
     * Substitui o flow responsável por `bodyType` — remove o anterior da
     * phase array e registra o novo. Use para hot-swap em dev mode ou
     * para apps que querem behavior diferente do default (e.g. trocar
     * LCPFlow por solver custom).
     */
    override(bodyType: string, flow: Flow): void {
        const previous = this.byBodyType.get(bodyType);
        if (previous !== undefined) {
            const arr = this.byPhase.get(previous.phase);
            if (arr !== undefined) {
                const index = arr.findIndex((r) => r.flow === previous);
                if (index >= 0) arr.splice(index, 1);
            }
        }
        this.byBodyType.set(bodyType, flow);
        const arr = this.byPhase.get(flow.phase) ?? [];
        arr.push({ flow, priority: flow.priority });
        arr.sort((a, b) => b.priority - a.priority);
        this.byPhase.set(flow.phase, arr);
    }

    /** Encontra o Flow registrado para um bodyType. Undefined se não-registrado. */
    resolve(bodyType: string): Flow | undefined {
        return this.byBodyType.get(bodyType);
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

    /** Iterator sobre todos os Flows registrados em ordem (phase × priority). */
    *allFlows(): IterableIterator<Flow> {
        for (const phase of PHASE_ORDER) {
            for (const reg of this.byPhase.get(phase) ?? []) {
                yield reg.flow;
            }
        }
    }
}
