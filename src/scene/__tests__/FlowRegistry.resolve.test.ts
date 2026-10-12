import { describe, expect, it } from 'vitest';
import { FlowRegistry } from '../flows/FlowRegistry';
import { Flow, type Phase } from '../flows/Flow';
import type { PipelineDescriptor } from '../descriptors/PipelineDescriptor';

class TestFlow extends Flow {
    readonly phase: Phase = 'physics';
    disposed = false;
    constructor(
        readonly type: string,
        readonly bodyType: string,
        priority = 0,
    ) {
        super();
        this.priority = priority;
    }
    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
    dispatch(): void {}
    override dispose(): void {
        this.disposed = true;
    }
}

describe('FlowRegistry.resolve — por prioridade (D5 item 6)', () => {
    it('devolve o de maior priority, independentemente da ordem de registro', () => {
        const registry = new FlowRegistry();
        const high = new TestFlow('high', 'Body', 10);
        const low = new TestFlow('low', 'Body', 1);
        registry.register(high);
        registry.register(low);
        expect(registry.resolve('Body')).toBe(high);
    });

    it('empate de priority: o último registrado', () => {
        const registry = new FlowRegistry();
        const first = new TestFlow('first', 'Body', 5);
        const second = new TestFlow('second', 'Body', 5);
        registry.register(first);
        registry.register(second);
        expect(registry.resolve('Body')).toBe(second);
    });

    it('ordem na fase: priority decrescente, empate pela ordem de registro', () => {
        const registry = new FlowRegistry();
        const a = new TestFlow('a', 'A', 1);
        const b = new TestFlow('b', 'B', 5);
        const c = new TestFlow('c', 'C', 1);
        for (const f of [a, b, c]) registry.register(f);
        expect(registry.flowsInPhase('physics').map((f) => f.type)).toEqual(['b', 'a', 'c']);
    });

    it('override vence a prioridade e substitui o responsável anterior na fase', () => {
        const registry = new FlowRegistry();
        const high = new TestFlow('high', 'Body', 10);
        const custom = new TestFlow('custom', 'Body', 0);
        registry.register(high);
        registry.override('Body', custom);
        expect(registry.resolve('Body')).toBe(custom);
        expect(registry.flowsInPhase('physics')).toEqual([custom]);
        // Registro posterior de prioridade maior não tira o override.
        registry.register(new TestFlow('later', 'Body', 99));
        expect(registry.resolve('Body')).toBe(custom);
    });

    it('unregister do vencedor devolve o próximo pela mesma regra', () => {
        const registry = new FlowRegistry();
        const high = new TestFlow('high', 'Body', 10);
        const mid = new TestFlow('mid', 'Body', 5);
        const low = new TestFlow('low', 'Body', 1);
        for (const f of [mid, high, low]) registry.register(f);
        expect(registry.unregister(high)).toBe(true);
        expect(high.disposed).toBe(true);
        expect(registry.resolve('Body')).toBe(mid);
        registry.unregister(mid);
        registry.unregister(low);
        expect(registry.resolve('Body')).toBeUndefined();
    });

    it('flows sem bodyType não são resolvidos', () => {
        const registry = new FlowRegistry();
        registry.register(new TestFlow('free', ''));
        expect(registry.resolve('')).toBeUndefined();
    });
});
