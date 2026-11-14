import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBody } from '../bodies/RigidBody';
import { lcpScene } from './helpers/lcpScene';

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
});

describe('LCPFlow — mapas de dono pelo ColliderSet (transições)', () => {
    it('collider novo além da capacidade: mapa recriado na transição, anterior destruído, narrowphase religada', async () => {
        const s = await lcpScene();
        s.scene.world.insert(new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1 }));
        s.step();
        const created = (prefix: string) =>
            vi
                .mocked(s.core.create)
                .mock.calls.map((c) => c[0] as { discriminator?: string })
                .filter((spec) => spec.discriminator?.startsWith(prefix));
        const first = created('lcp_colliders:owners:SphereCollider:')[0];
        expect(first).toBeDefined();
        const replaced: string[] = [];
        s.scene.events.on('bindGroupReplaced', (e) => replaced.push(e.pipeline));
        // Capacidade mínima do mapa é 4: o 5º collider força a recriação.
        for (let i = 1; i <= 4; i++) {
            s.scene.world.insert(
                new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1, position: [2 * i, 0, 0] }),
            );
        }
        s.step();
        expect(created('lcp_colliders:owners:SphereCollider:').length).toBeGreaterThan(1);
        expect(s.core.destroy).toHaveBeenCalledWith(first);
        expect(replaced).toContain('lcp_narrowphase_sphere');
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('unregister libera os buffers do conjunto de colliders', async () => {
        const s = await lcpScene();
        s.scene.world.insert(new RigidBody({ shape: 'sphere', radius: 0.5, mass: 1 }));
        s.step();
        const owners = vi
            .mocked(s.core.create)
            .mock.calls.map((c) => c[0] as { discriminator?: string })
            .filter((spec) => spec.discriminator?.startsWith('lcp_colliders:'));
        expect(owners.length).toBeGreaterThan(0);
        s.scene.flows.unregister(s.scene.flows.resolve('LCPSchema')!);
        for (const spec of owners) expect(s.core.destroy).toHaveBeenCalledWith(spec);
    });
});
