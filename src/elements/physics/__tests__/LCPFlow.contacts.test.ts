import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RigidBody } from '../bodies/RigidBody';
import type { StorageBufferSpec } from '../../../scene/contracts/gpu';
import { AtomicAllocCounterSchema } from '../../gpu/compute/schemas';
import { lcpScene } from './helpers/lcpScene';

async function setup(
    bodies: number,
    options: { maxContactsPerBody?: number; maxBinding?: number } = {},
) {
    const s = await lcpScene(
        {
            substeps: 2,
            ...(options.maxContactsPerBody !== undefined
                ? { maxContactsPerBody: options.maxContactsPerBody }
                : {}),
        },
        options.maxBinding,
    );
    s.scene.world.insert(new RigidBody({ shape: 'box', mass: 0, halfExtents: [10, 0.5, 10] }));
    for (let i = 0; i < bodies; i++) {
        s.scene.world.insert(
            new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [i, 2, 0] }),
        );
    }
    return s;
}

const created = (core: Awaited<ReturnType<typeof setup>>['core'], prefix: string) =>
    vi
        .mocked(core.create)
        .mock.calls.map((c) => c[0] as StorageBufferSpec)
        .filter((spec) => spec.discriminator?.startsWith(prefix) === true);

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('LCPFlow — contatos compactados (R19)', () => {
    it('capacidade = min(N·M·8, N × maxContactsPerBody, limite de binding / 96)', async () => {
        expect((await setup(0)).flow().contactCapacity(1000, 1001)).toBe(32_000);
        expect((await setup(0, { maxContactsPerBody: 4 })).flow().contactCapacity(1000, 1001)).toBe(
            4000,
        );
        expect((await setup(0)).flow().contactCapacity(3, 2)).toBe(48); // 3 × 2 pares × 8 cantos
        expect((await setup(0, { maxBinding: 8000 })).flow().contactCapacity(1000, 1001)).toBe(83); // 8000 / 96
    });

    it('buffers de contatos, bias e warm start dimensionados pela capacidade, não por N·M (em framePrepare)', async () => {
        const s = await setup(40);
        s.step(1 / 60);
        // 41 corpos × 41 colliders; capacidade = 41 × 32 = 1312 < 41 × 41 × 8 (descritores do trabalho, spec 039)
        const capacity = 41 * 32;
        expect(created(s.core, 'lcp_contacts:').at(-1)!.byteSize).toBe(capacity * 96);
        expect(created(s.core, 'lcp_bvec:').at(-1)!.byteSize).toBe(capacity * 4);
        expect(created(s.core, 'lcp_warm:').at(-1)!.byteSize).toBe(2 * 4096 * 16); // 2 regiões de 2^k ≥ 2C
        // Um registro AtomicAllocCounter (a C2 alinha os buffers próprios a 16 B).
        expect(created(s.core, 'lcp_contact_counter:')[0]!.byteSize).toBe(
            Math.ceil(AtomicAllocCounterSchema.stride / 16) * 16,
        );
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('por substep: contador, contatos por corpo, somas do solve e a região de warm start zerados antes da narrowphase; correção zerada antes do commit', async () => {
        const s = await setup(3);
        s.step(1 / 60);
        const seq = s.sequence().filter(
            (e) =>
                // A broadphase (spec 007) zera as suas contagens uma vez por passo, antes dos substeps.
                (e.startsWith('clear:')
                    && !e.startsWith('clear:lcp_pair_counts')
                    && !e.startsWith('clear:lcp_broadphase_grid'))
                || e === 'pass:LCPFlow.narrowphase.BoxCollider'
                || e === 'pass:LCPFlow.warmStore'
                || e === 'pass:LCPFlow.accumulate'
                || e === 'pass:LCPFlow.commit',
        );
        // Capacidade 128 ⇒ regiões de 256 entradas × 16 B; carimbos 1 e 2 alternam as regiões.
        const substep = (warmOffset: number): unknown[] => [
            expect.stringMatching(/^clear:lcp_contact_counter:[^@]*$/),
            expect.stringMatching(/^clear:lcp_body_split:/),
            expect.stringMatching(/^clear:lcp_body_delta:/),
            expect.stringMatching(new RegExp(`^clear:lcp_warm:[^@]*@${warmOffset}$`)),
            'pass:LCPFlow.narrowphase.BoxCollider',
            'pass:LCPFlow.warmStore',
        ];
        expect(seq).toEqual([
            ...substep(4096),
            ...substep(0),
            expect.stringMatching(/^clear:lcp_body_contact:/),
            'pass:LCPFlow.accumulate',
            'pass:LCPFlow.commit',
        ]);
    });

    it('build percorre a capacidade (guarda pela contagem no shader)', async () => {
        const s = await setup(3);
        const build = s.step(1 / 60).find((p) => p.label === 'LCPFlow.buildLcp')!;
        expect(build.dispatches[0]).toEqual([4 * 4 * 8, 64]); // 4 corpos × 4 colliders × 8 = 4 × 32
    });

    it('contact_stamp cresce por substep e entra em cada região; capacidades nas regiões', async () => {
        const s = await setup(3);
        s.writes.length = 0;
        s.step(2 / 60);
        const w = s.writes.find((x) =>
            (x.spec as { discriminator: string }).discriminator.startsWith('lcp_sim_params:'),
        )!;
        const u32 = new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
        // 2 passos × (1 região de passo + 2 de substep) = 6 regiões de 256 B (64 u32)
        const stamps = [0, 1, 2, 3, 4, 5].map((r) => u32[r * 64 + 13]);
        expect(stamps).toEqual([0, 1, 2, 2, 3, 4]);
        expect(u32[64 + 6]).toBe(128); // max_contacts
        expect(u32[64 + 17]).toBe(256); // warm_capacity = 2^k ≥ 2 × 128
    });

    it('excedente de contatos gera um único aviso', async () => {
        const s = await setup(1);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        s.flow().overflow(10, 0);
        expect(warn).not.toHaveBeenCalled();
        s.flow().overflow(40, 8);
        s.flow().overflow(40, 9);
        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]![0])).toMatch(/8 contatos acima da capacidade/);
    });
});
