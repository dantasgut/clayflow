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
import { ProbeCam, ProbeCamSchema, probeScene } from '../helpers/probeFlow';

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
