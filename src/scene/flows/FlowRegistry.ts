import type { Flow, Phase } from './Flow';

interface RegisteredFlow {
    readonly flow: Flow;
    readonly priority: number;
}

const PHASE_ORDER: readonly Phase[] = ['physics', 'shadow', 'forward', 'post', 'ui'];

export class FlowRegistry {
    private readonly byPhase = new Map<Phase, RegisteredFlow[]>();
    private readonly byBodyType = new Map<string, Flow>();

    register(flow: Flow): void {
        const arr = this.byPhase.get(flow.phase) ?? [];
        arr.push({ flow, priority: flow.priority });
        arr.sort((a, b) => b.priority - a.priority);
        this.byPhase.set(flow.phase, arr);
        if (flow.bodyType.length > 0) {
            this.byBodyType.set(flow.bodyType, flow);
        }
    }

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

    resolve(bodyType: string): Flow | undefined {
        return this.byBodyType.get(bodyType);
    }

    flowsInPhase(phase: Phase): readonly Flow[] {
        return (this.byPhase.get(phase) ?? []).map((r) => r.flow);
    }

    activeFlowsInPhase(phase: Phase): readonly Flow[] {
        return this.flowsInPhase(phase).filter((f) => f.isReady());
    }

    phasesInOrder(): readonly Phase[] {
        return PHASE_ORDER;
    }

    *allFlows(): IterableIterator<Flow> {
        for (const phase of PHASE_ORDER) {
            for (const reg of this.byPhase.get(phase) ?? []) {
                yield reg.flow;
            }
        }
    }
}
