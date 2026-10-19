/**
 * Integração — a física espera os estágios dela (spec 034, FR-026).
 *
 * Cobertura:
 *   - `Time.hold` desfaz o tempo do quadro (dt, elapsed, acumulador, simulado) e deixa 0 passos; o tempo retoma de onde
 *     parou
 *   - com um pipeline da fase `physics` compilando, o relógio não anda e `simulationHeld` sai uma vez; ao compilar,
 *     `simulationResumed` e os passos voltam — o mesmo número de passos com compilação lenta ou rápida
 *   - pipeline de outra fase compilando não segura a física
 *   - compilação que falha depois do descarte do Flow não vira exceção solta; antes, rejeita o pipeline
 */
import { describe, expect, it, vi } from 'vitest';
import type { EngineCore } from '../../contracts/gpu';
import type { Phase } from '../../flows/Phase';
import { Time } from '../../time/Time';
import {
    ProbeBody,
    ProbeCam,
    ProbeFlow,
    probeParams,
    probePipeline,
    probeScene,
} from '../helpers/probeFlow';

/** Compilações assíncronas do core seguradas até `release()` (ou rejeitadas com `fail()`). */
function holdCompiles(core: EngineCore): {
    release(): void;
    fail(error: Error): void;
    pending(): number;
} {
    const waiting: { resolve(): void; reject(e: Error): void }[] = [];
    const original = core.createAsync.bind(core);
    core.createAsync = <S>(spec: S): Promise<S> =>
        new Promise<S>((resolve, reject) => {
            waiting.push({
                resolve: () => {
                    void original(spec as never).then(() => {
                        resolve(spec);
                    });
                },
                reject,
            });
        });
    return {
        release() {
            for (const w of waiting.splice(0)) w.resolve();
        },
        fail(error) {
            for (const w of waiting.splice(0)) w.reject(error);
        },
        pending: () => waiting.length,
    };
}

const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function physicsScene(phase: Phase = 'physics') {
    const s = await probeScene();
    const compiles = holdCompiles(s.scene.core);
    const reg = s.scene.flows.register(
        () => new ProbeFlow(probeParams, { pipelines: [probePipeline({ preferAsync: true })] }),
        { type: 'probe', phase, bodyType: 'ProbeBody' },
    );
    s.scene.world.insert(new ProbeCam());
    s.scene.world.insert(new ProbeBody());
    const held = vi.fn();
    const resumed = vi.fn();
    s.scene.events.on('simulationHeld', held);
    s.scene.events.on('simulationResumed', resumed);
    let steps = 0;
    /** Um quadro como o do `GameLoop`: o relógio avança e o quadro é gravado. */
    const frame = (): void => {
        s.scene.time.advance(1 / 60);
        s.frame();
        steps += s.scene.time.steps;
    };
    return { ...s, compiles, flow: () => reg.flow!, held, resumed, frame, steps: () => steps };
}

describe('Integração — a física espera os estágios dela', () => {
    it('Time.hold desfaz o tempo do quadro e o relógio retoma de onde parou', () => {
        const time = new Time();
        time.advance(1 / 60);
        const before = { elapsed: time.elapsed, simulated: time.simulated, frame: time.frame };
        time.advance(1 / 60);
        time.hold();
        expect(time.steps).toBe(0);
        expect(time.dt).toBe(0);
        expect(time.elapsed).toBe(before.elapsed);
        expect(time.simulated).toBe(before.simulated);
        expect(time.frame).toBe(before.frame + 1);
        expect(time.data.steps).toBe(0);
        time.advance(1 / 60);
        expect(time.steps).toBe(1);
        expect(time.simulated).toBeCloseTo(2 / 60, 12);
    });

    it('pipeline da física compilando: o relógio não anda; ao compilar, retoma (simulationHeld/Resumed)', async () => {
        const s = await physicsScene();
        s.frame();
        s.frame();
        s.frame();
        expect(s.compiles.pending()).toBe(1);
        expect(s.steps()).toBe(0);
        expect(s.scene.time.simulated).toBe(0);
        expect(s.held).toHaveBeenCalledOnce();
        expect(s.held.mock.calls[0]![0]).toEqual({ flows: ['probe'] });
        s.compiles.release();
        await flush();
        s.frame();
        expect(s.resumed).toHaveBeenCalledOnce();
        expect(s.steps()).toBe(1);
        expect(s.flow().lifecycle).toBe('ready');
    });

    it('o mesmo número de passos com a compilação lenta ou rápida', async () => {
        const run = async (heldFrames: number): Promise<number[]> => {
            const s = await physicsScene();
            for (let i = 0; i < heldFrames; i++) s.frame();
            s.compiles.release();
            await flush();
            const simulated: number[] = [];
            for (let i = 0; i < 10; i++) {
                s.frame();
                simulated.push(s.scene.time.simulated);
            }
            return simulated;
        };
        expect(await run(1)).toEqual(await run(30));
    });

    it('pipeline de outra fase compilando não segura a física', async () => {
        const s = await physicsScene('forward');
        s.frame();
        s.frame();
        expect(s.compiles.pending()).toBe(1);
        expect(s.steps()).toBe(2);
        expect(s.held).not.toHaveBeenCalled();
    });

    it('compilação que falha depois do descarte do Flow não vira exceção solta', async () => {
        const s = await physicsScene();
        s.frame();
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        try {
            s.scene.dispose();
            s.compiles.fail(
                new Error('GpuEngineCore: device perdido durante a compilação do pipeline.'),
            );
            await flush();
            await new Promise((r) => setTimeout(r, 0));
            expect(unhandled).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', unhandled);
        }
    });

    it('compilação que falha com o Flow vivo rejeita o pipeline e solta o relógio', async () => {
        const s = await physicsScene();
        s.frame();
        s.compiles.fail(new Error('falhou'));
        await flush();
        s.frame();
        expect(s.flow().events.map((e) => e.type)).toContain('pipelineRejected');
        expect(s.resumed).toHaveBeenCalledOnce();
        expect(s.steps()).toBe(1);
    });
});
