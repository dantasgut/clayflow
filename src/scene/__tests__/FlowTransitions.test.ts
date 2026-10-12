import { describe, expect, it, vi } from 'vitest';
import {
    applyTransition,
    FlowTransitionError,
    type FlowTransitions,
} from '../flows/FlowTransitions';

type S = 'idle' | 'armed';
const ctx = { tag: 'ctx' };

describe('applyTransition', () => {
    it('transição válida muda o estado e roda run com o evento e o contexto', () => {
        const run = vi.fn();
        const table: FlowTransitions<S, typeof ctx> = {
            idle: { slotsResolved: { to: 'armed', run } },
        };
        const next = applyTransition('T', table, 'idle', { type: 'slotsResolved' }, ctx);
        expect(next).toBe('armed');
        expect(run).toHaveBeenCalledWith({ type: 'slotsResolved' }, ctx);
    });

    it("'ignore' mantém o estado; '*' vale para qualquer estado, depois do estado atual", () => {
        const table: FlowTransitions<S, typeof ctx> = {
            armed: { poolReallocated: { to: 'idle' } },
            '*': { poolReallocated: 'ignore', pipelinesCompiled: 'ignore' },
        };
        expect(
            applyTransition('T', table, 'idle', { type: 'poolReallocated', poolKey: 'P' }, ctx),
        ).toBe('idle');
        expect(
            applyTransition('T', table, 'armed', { type: 'poolReallocated', poolKey: 'P' }, ctx),
        ).toBe('idle');
        expect(applyTransition('T', table, 'armed', { type: 'pipelinesCompiled' }, ctx)).toBe(
            'armed',
        );
    });

    it('evento sem entrada lança nomeando Flow, estado e evento', () => {
        const table: FlowTransitions<S, typeof ctx> = { idle: {} };
        const call = () =>
            applyTransition('Probe', table, 'idle', { type: 'slotLost', slot: 'cam' }, ctx);
        expect(call).toThrow(FlowTransitionError);
        expect(call).toThrow(/'Probe'.*'slotLost'.*'idle'/);
        try {
            call();
        } catch (e) {
            expect(e).toMatchObject({ flowType: 'Probe', state: 'idle', event: 'slotLost' });
        }
    });

    it('run que lança não muda o estado', () => {
        const table: FlowTransitions<S, typeof ctx> = {
            idle: {
                slotsResolved: {
                    to: 'armed',
                    run: () => {
                        throw new Error('falhou');
                    },
                },
            },
        };
        expect(() => applyTransition('T', table, 'idle', { type: 'slotsResolved' }, ctx)).toThrow(
            'falhou',
        );
    });
});
