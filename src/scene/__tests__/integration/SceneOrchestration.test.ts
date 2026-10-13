/**
 * Integração — orquestração da cena de ponta a ponta.
 *
 * EventBus, World, FlowRegistry, ResourceSystem (C2) e ExecutionSystem reais; só o EngineCore é um double. Valida a
 * propagação World → C2 → transições do Flow, o isolamento entre cenas e o descarte.
 */
import { describe, expect, it } from 'vitest';
import { ProbeBody, ProbeCam, ProbeFlow, probeParams, probeScene } from '../helpers/probeFlow';

async function sceneWithProbe() {
    const s = await probeScene();
    const reg = s.scene.flows.register(() => new ProbeFlow(probeParams), {
        type: 'probe',
        phase: 'physics',
        bodyType: 'ProbeBody',
    });
    s.scene.world.insert(new ProbeCam());
    s.scene.world.insert(new ProbeBody());
    s.frame();
    return { ...s, probe: reg.flow! };
}

describe('Integração — orquestração da cena', () => {
    it('createScene → registro por factory → quadro grava o Flow pronto → dispose', async () => {
        const s = await sceneWithProbe();
        expect(s.probe.lifecycle).toBe('ready');
        expect(s.probe.dispatched).toEqual([1]);
        s.scene.dispose();
        expect(s.probe.disposed).toBe(true);
        expect(s.probe.lifecycle).toBe('disposed');
    });

    it('eventos do World chegam às transições do Flow pela C2 (crescimento do pool → poolReallocated)', async () => {
        const s = await sceneWithProbe();
        s.probe.events.length = 0;
        for (let i = 0; i < 500; i++) s.scene.world.insert(new ProbeBody());
        s.frame();
        expect(s.probe.events.map((e) => e.type)).toContain('poolReallocated');
        expect(s.probe.dispatched.at(-1)).toBe(501);
    });

    it('cenas não compartilham estado: eventos de uma não chegam aos Flows da outra', async () => {
        const a = await sceneWithProbe();
        const b = await sceneWithProbe();
        a.probe.events.length = 0;
        b.probe.events.length = 0;
        for (let i = 0; i < 500; i++) a.scene.world.insert(new ProbeBody());
        a.frame();
        b.frame();
        expect(a.probe.events.length).toBeGreaterThan(0);
        expect(b.probe.events).toEqual([]);
        a.scene.dispose();
        b.scene.dispose();
    });

    it('dispose duplo não lança', async () => {
        const s = await sceneWithProbe();
        expect(() => {
            s.scene.dispose();
            s.scene.dispose();
        }).not.toThrow();
    });
});
