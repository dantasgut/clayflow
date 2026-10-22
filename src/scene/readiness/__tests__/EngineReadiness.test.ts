/**
 * Prontidão do motor (spec 034, US4): estados e transições pela reconciliação dos Flows, falha de compilação nomeada,
 * falha depois do descarte absorvida, `consumerMissing` uma vez por binding sem fonte persistente.
 */
import { describe, expect, it, vi } from 'vitest';
import { DefaultEventBus } from '../../events/DefaultEventBus';
import type {
    ConsumerMissingPayload,
    EngineErrorPayload,
    EnginePreparingPayload,
} from '../../events/EventMap';
import { CONSUMER_MISSING_FRAMES, EngineReadiness } from '../EngineReadiness';
import {
    ProbeBody,
    ProbeCam,
    ProbeFlow,
    probeParams,
    probePipeline,
    probeScene,
} from '../../__tests__/helpers/probeFlow';

const flush = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('EngineReadiness', () => {
    it('transições: preparing → ready emitem um evento cada; sem mudança, nada', () => {
        const events = new DefaultEventBus();
        const seen: string[] = [];
        events.on('enginePreparing', () => seen.push('preparing'));
        events.on('engineReady', () => seen.push('ready'));
        const r = new EngineReadiness(events);
        r.update([{ flow: 'F', pipeline: 'p', reason: 'compiling' }]);
        r.update([{ flow: 'F', pipeline: 'p', reason: 'compiling' }]);
        r.update([]);
        r.update([]);
        expect(seen).toEqual(['preparing', 'ready']);
        expect(r.state).toBe('ready');
        expect(r.revision).toBe(2);
        expect(r.evaluations).toBe(4);
    });

    it('primeira avaliação sem pendências anuncia ready', () => {
        const events = new DefaultEventBus();
        const ready = vi.fn();
        events.on('engineReady', ready);
        new EngineReadiness(events).update([]);
        expect(ready).toHaveBeenCalledOnce();
    });

    it('consumerMissing: só depois de quadros seguidos sem fonte, uma vez por binding', () => {
        const events = new DefaultEventBus();
        const missing: ConsumerMissingPayload[] = [];
        events.on('consumerMissing', (e) => missing.push(e));
        const r = new EngineReadiness(events);
        const waiting = [{ flow: 'F', pipeline: 'p', reason: 'waiting' as const, name: 'lights' }];
        for (let i = 0; i < CONSUMER_MISSING_FRAMES - 1; i++) r.update(waiting);
        expect(missing).toEqual([]);
        r.update(waiting);
        for (let i = 0; i < 10; i++) r.update(waiting);
        expect(missing).toEqual([{ flow: 'F', pipeline: 'p', name: 'lights' }]);
    });

    it('fonte que chega antes do prazo não avisa (a contagem recomeça)', () => {
        const events = new DefaultEventBus();
        const missing = vi.fn();
        events.on('consumerMissing', missing);
        const r = new EngineReadiness(events);
        const waiting = [{ flow: 'F', pipeline: 'p', reason: 'waiting' as const, name: 'cam' }];
        for (let i = 0; i < CONSUMER_MISSING_FRAMES - 1; i++) r.update(waiting);
        r.update([]);
        for (let i = 0; i < CONSUMER_MISSING_FRAMES - 1; i++) r.update(waiting);
        expect(missing).not.toHaveBeenCalled();
    });
});

describe('prontidão pela reconciliação dos Flows', () => {
    /** Cena com câmera e corpo; `register()` registra o Flow de pipeline assíncrono (síncrono, sem ceder). */
    async function asyncScene() {
        const s = await probeScene();
        s.scene.world.insert(new ProbeCam());
        s.scene.world.insert(new ProbeBody());
        const flow = new ProbeFlow(probeParams, {
            pipelines: [probePipeline({ preferAsync: true })],
        });
        const register = (): void => {
            s.scene.flows.register(() => flow, {
                type: 'ProbeFlow',
                phase: 'transform',
                bodyType: 'ProbeBody',
            });
        };
        return { ...s, flow, register, readiness: s.scene.resourceSystem.readiness };
    }

    it('compilação em voo: preparing com o pipeline; pronto no quadro depois de compilar', async () => {
        const s = await asyncScene();
        const preparing: EnginePreparingPayload[] = [];
        s.scene.events.on('enginePreparing', (e) => preparing.push(e));
        s.register();
        s.frame();
        expect(s.readiness.state).toBe('preparing');
        expect(preparing.at(-1)?.pending).toContainEqual({
            flow: 'ProbeFlow',
            pipeline: 'main',
            reason: 'compiling',
        });
        await flush();
        s.frame();
        expect(s.readiness.pending).toEqual([
            { flow: 'World', pipeline: 'resourcesChanged', reason: 'settling' },
        ]);
        // O quadro da inserção e o seguinte acomodam a cena; no terceiro, pronto.
        s.frame();
        expect(s.readiness.pending).toEqual([]);
        expect(s.readiness.state).toBe('ready');
        expect(s.readiness.pending).toEqual([]);
    });

    it('compilação que falha: engineError com o Flow e o pipeline; não fica pendente para sempre', async () => {
        const s = await asyncScene();
        const errors: EngineErrorPayload[] = [];
        s.scene.events.on('engineError', (e) => errors.push(e));
        vi.mocked(s.counting.core.createAsync).mockImplementation(() =>
            Promise.reject(new Error('device perdido durante a compilação do pipeline')),
        );
        s.register();
        s.frame();
        await flush();
        s.frame();
        s.frame();
        expect(errors).toHaveLength(1);
        expect(errors[0]!.stage).toBe('pipeline');
        expect(errors[0]!.message).toMatch(/Flow 'ProbeFlow', pipeline 'main': device perdido/);
        expect(s.readiness.pending).toEqual([]);
        expect(s.flow.lifecycle).toBe('preparing');
    });

    it('pipeline síncrono que não valida no device: engineError com o Flow e o pipeline', async () => {
        // Arrange
        const s = await probeScene();
        s.scene.world.insert(new ProbeCam());
        s.scene.world.insert(new ProbeBody());
        const flow = new ProbeFlow(probeParams, { pipelines: [probePipeline()] });
        const errors: EngineErrorPayload[] = [];
        s.scene.events.on('engineError', (e) => errors.push(e));
        vi.mocked(s.counting.core.withErrorScope).mockImplementation(async (_filter, body) => {
            await body();
            throw new Error("[validation] redeclaration of 'm'");
        });
        // Act
        s.scene.flows.register(() => flow, {
            type: 'ProbeFlow',
            phase: 'transform',
            bodyType: 'ProbeBody',
        });
        s.frame();
        await flush();
        s.frame();
        // Assert
        expect(errors).toHaveLength(1);
        expect(errors[0]!.stage).toBe('pipeline');
        expect(errors[0]!.message).toMatch(/Flow 'ProbeFlow', pipeline 'main': .*redeclaration/);
    });

    it('falha depois do descarte da cena é absorvida (sem erro nem rejeição não tratada)', async () => {
        const s = await asyncScene();
        const errors = vi.fn();
        s.scene.events.on('engineError', errors);
        let reject!: (e: Error) => void;
        vi.mocked(s.counting.core.createAsync).mockImplementation(
            () => new Promise((_, r) => (reject = r)),
        );
        s.register();
        s.frame();
        s.scene.dispose();
        reject(new Error('device perdido'));
        await flush();
        expect(errors).not.toHaveBeenCalled();
    });
});
