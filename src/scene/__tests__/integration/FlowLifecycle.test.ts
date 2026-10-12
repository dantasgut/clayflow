/**
 * Integração — ciclo de vida dos Flows no quadro (`ExecutionSystem`).
 *
 * Cobertura:
 *   - Flow com slot obrigatório sem recurso fica `pending` e não grava; grava a partir do quadro em que o recurso
 *     existe
 *   - Flows na mesma fase são ordenados por prioridade (empate: ordem de registro)
 *   - `frameComplete` é emitido mesmo sem nenhum Flow pronto
 *   - fases executam em ordem fixa
 */
import { describe, expect, it } from 'vitest';
import type { Frame } from '../../../core/contracts/Frame';
import { Flow } from '../../flows/Flow';
import type { TransitionContext } from '../../flows/FlowBinding';
import type { FlowTransitions } from '../../flows/FlowTransitions';
import type { Phase } from '../../flows/Phase';
import { slot } from '../../flows/slots';
import { FlowBindingError } from '../../flows/FlowBindingError';
import { createScene } from '../../SceneContext';
import { countingCore } from '../helpers/countingCore';
import {
    ProbeBody,
    ProbeCam,
    ProbeCamSchema,
    ProbeFlow,
    probeParams,
    probePipeline,
    probeScene,
} from '../helpers/probeFlow';

const freeSlots = {};
const camSlots = { cam: slot.singleton(ProbeCamSchema) };

/** Flow de teste sem pipelines: anota a gravação numa sequência compartilhada. */
class TestFlow<TSlots extends typeof freeSlots | typeof camSlots> extends Flow<TSlots, 'idle'> {
    protected readonly initialState = 'idle' as const;
    protected readonly transitions: FlowTransitions<'idle', TransitionContext<TSlots>> = {
        '*': {
            slotsResolved: 'ignore',
            slotLost: 'ignore',
            pipelinesCompiled: 'ignore',
            bindGroupReplaced: 'ignore',
        },
    };

    constructor(
        readonly type: string,
        readonly slots: TSlots,
        private readonly sequence: string[],
    ) {
        super();
    }

    dispatch(_frame: Frame): void {
        this.sequence.push(this.type);
    }
}

async function scene() {
    const s = await probeScene();
    const sequence: string[] = [];
    const add = (type: string, phase: Phase, priority = 0, needsCam = false) =>
        s.scene.flows.register(
            () =>
                needsCam
                    ? new TestFlow(type, camSlots, sequence)
                    : new TestFlow(type, freeSlots, sequence),
            { type, phase, priority },
        ).flow!;
    const frame = (): string[] => {
        sequence.length = 0;
        s.frame();
        return [...sequence];
    };
    return { ...s, add, frame };
}

describe('Integração — ciclo de vida dos Flows', () => {
    it('slot obrigatório sem recurso: pending e sem gravação; grava no quadro em que o recurso existe', async () => {
        const s = await scene();
        s.add('Free', 'forward');
        const waiting = s.add('NeedsCam', 'forward', 0, true);
        expect(s.frame()).toEqual(['Free']);
        expect(waiting.lifecycle).toBe('pending');
        s.scene.world.insert(new ProbeCam());
        expect(s.frame()).toEqual(['Free', 'NeedsCam']);
        expect(waiting.lifecycle).toBe('ready');
    });

    it('na mesma fase, prioridade decrescente; empate pela ordem de registro', async () => {
        const s = await scene();
        s.add('B', 'forward', 0);
        s.add('A', 'forward', 10);
        s.add('C', 'forward', 5);
        s.add('D', 'forward', 0);
        expect(s.frame()).toEqual(['A', 'C', 'B', 'D']);
        expect(s.scene.flows.flowsInPhase('forward').map((f) => f.type)).toEqual([
            'A',
            'C',
            'B',
            'D',
        ]);
    });

    it('frameComplete emitido mesmo sem nenhum Flow pronto', async () => {
        const s = await scene();
        s.add('Waiting', 'forward', 0, true);
        let completed = 0;
        s.scene.events.on('frameComplete', () => {
            completed++;
        });
        expect(s.frame()).toEqual([]);
        expect(completed).toBe(1);
    });

    it('fases em ordem fixa (physics → transform → shadow → forward → post → ui)', async () => {
        const s = await scene();
        s.add('UI', 'ui');
        s.add('Phys', 'physics');
        s.add('Post', 'post');
        s.add('Shdw', 'shadow');
        s.add('Xf', 'transform');
        s.add('Fwd', 'forward');
        expect(s.frame()).toEqual(['Phys', 'Xf', 'Shdw', 'Fwd', 'Post', 'UI']);
    });
});

describe('Integração — eventos da C2 com o Flow pronto', () => {
    async function probeReady(options: ConstructorParameters<typeof ProbeFlow>[1] = {}) {
        const s = await probeScene();
        const reg = s.scene.flows.register(() => new ProbeFlow(probeParams, options), {
            type: 'probe',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        s.scene.world.insert(new ProbeCam());
        s.scene.world.insert(new ProbeBody());
        s.frame();
        return { ...s, probe: reg.flow! };
    }

    it('slots não resolvidos: o Flow não está ativo no ExecutionSystem', async () => {
        const s = await scene();
        const waiting = s.add('NeedsCam', 'forward', 0, true);
        s.frame();
        expect(s.scene.executionSystem.isActive(waiting)).toBe(false);
        s.scene.world.insert(new ProbeCam());
        s.frame();
        expect(s.scene.executionSystem.isActive(waiting)).toBe(true);
    });

    it('bindGroupReplaced em ready: o Flow segue pronto (sem preparing) e grava com o grupo novo', async () => {
        const s = await probeReady();
        const before = s.probe.events.length;
        const lifecycles: string[] = [];
        s.scene.events.on('flowSuspended', () => lifecycles.push('suspended'));
        for (let i = 0; i < 500; i++) s.scene.world.insert(new ProbeBody());
        s.frame();
        const replaced = s.probe.events.slice(before).filter((e) => e.type === 'bindGroupReplaced');
        expect(replaced.length).toBeGreaterThan(0);
        expect(lifecycles).toEqual([]);
        expect(s.probe.lifecycle).toBe('ready');
        expect(s.probe.dispatched.at(-1)).toBe(501);
        const last = replaced.at(-1)!;
        expect(last.type === 'bindGroupReplaced' && last.newSpec).not.toBe(
            last.type === 'bindGroupReplaced' && last.oldSpec,
        );
    });

    it('consumes sem resolver: falha na primeira tentativa de preparação, sem ligar binding vazio', async () => {
        const counting = countingCore();
        const s = createScene({ core: counting.core });
        await s.initialize();
        s.flows.register(() => new ProbeFlow(probeParams), {
            type: 'probe',
            phase: 'physics',
            bodyType: 'ProbeBody',
        });
        s.world.insert(new ProbeCam());
        expect(() => {
            s.world.insert(new ProbeBody());
            s.events.emit('frameTick', { dt: 1 / 60, realDt: 1 / 60, elapsed: 1 / 60, frame: 1 });
        }).toThrow(FlowBindingError);
        expect(counting.stats().creates.get('bindgroup') ?? 0).toBe(0);
    });

    it('pipeline assíncrono: o Flow só entra no quadro depois de compilado', async () => {
        const s = await probeReady({ pipelines: [probePipeline({ preferAsync: true })] });
        expect(s.probe.dispatched).toEqual([]);
        expect(s.probe.lifecycle).not.toBe('ready');
        await Promise.resolve();
        await Promise.resolve();
        s.frame();
        expect(s.probe.lifecycle).toBe('ready');
        expect(s.probe.dispatched).toEqual([1]);
        expect(s.probe.events.map((e) => e.type)).toContain('pipelinesCompiled');
    });
});
