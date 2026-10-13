/**
 * Pose dos corpos rígidos publicada na GPU (spec 007, US3): o LCP despacha `rb_publish_pose` sobre a lista de registros
 * vivos (`RigidPose`), o `Transform` do corpo é de posse da GPU (mutação ignorada com aviso), nenhuma leitura de pose
 * volta para a CPU por quadro e o contador de excedente é amostrado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBody } from '../bodies/RigidBody';
import { Transform } from '../../scene/Transform';
import { lcpScene } from './helpers/lcpScene';

async function setup(bodies = 3) {
    const s = await lcpScene();
    s.scene.world.insert(new RigidBody({ shape: 'box', mass: 0, halfExtents: [10, 0.5, 10] }));
    const list = Array.from({ length: bodies }, (_, i) => {
        const body = new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [i, 4, 0] });
        s.scene.world.insert(body);
        return body;
    });
    return { ...s, list };
}

const transformOf = (body: RigidBody) => body.attached.find((p) => p instanceof Transform)!;

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('LCPFlow — pose publicada na GPU (spec 007)', () => {
    it('um despacho de publicação por quadro com passo, sobre os corpos vivos (chão incluído)', async () => {
        const s = await setup(3);
        s.step();
        const passes = s.step();
        const publish = passes.filter((p) => p.label === 'LCPFlow.publishPose');
        expect(publish).toHaveLength(1);
        expect(publish[0]!.dispatches).toEqual([[4, 64]]);
        // A publicação vem depois do commit do último passo.
        const labels = passes.map((p) => p.label);
        expect(labels.lastIndexOf('LCPFlow.commit')).toBeLessThan(
            labels.indexOf('LCPFlow.publishPose'),
        );
    });

    it('nenhuma leitura de volta da pose por quadro; o contador de excedente é lido no máximo a cada 60 passos', async () => {
        const s = await setup(3);
        for (let i = 0; i < 59; i++) s.step();
        await vi.runAllTimersAsync();
        expect(s.core.readback).not.toHaveBeenCalled();
        s.step();
        await vi.runAllTimersAsync();
        // Só os contadores de diagnóstico (contatos e pares da broadphase), não o pool de corpos.
        const read = () =>
            vi
                .mocked(s.core.readback)
                .mock.calls.map(([spec]) => (spec as { discriminator?: string }).discriminator);
        expect(read()).toEqual(['lcp_contact_counter_staging', 'lcp_pair_counts_staging']);
        for (let i = 0; i < 10; i++) s.step();
        await vi.runAllTimersAsync();
        expect(read()).toHaveLength(2);
    });

    it('o Transform do corpo é de posse da GPU: mutação ignorada com aviso único', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await setup(1);
        s.step();
        const before = s.writes.length;
        const transform = transformOf(s.list[0]!);
        transform.data.position = [9, 9, 9, 1];
        s.step();
        transform.data.position = [8, 8, 8, 1];
        s.step();
        const toTransform = s.writes
            .slice(before)
            .filter((w) =>
                (w.spec as { discriminator?: string }).discriminator?.startsWith('pool:Transform'),
            );
        expect(toTransform).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(s.scene.resourceSystem.poolInfo('Transform')!.gpuOwned).toBe(2); // chão + esfera
    });

    it('corpo removido sai da lista no quadro seguinte; a posse do slot é liberada', async () => {
        const s = await setup(3);
        s.step();
        s.scene.world.remove(s.list[1]!);
        const publish = s.step().filter((p) => p.label === 'LCPFlow.publishPose');
        expect(publish[0]!.dispatches).toEqual([[3, 64]]);
        expect(s.scene.resourceSystem.poolInfo('Transform')!.gpuOwned).toBe(3);
    });
});
