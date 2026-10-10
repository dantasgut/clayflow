import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LCPFlow } from '../flows/LCPFlow';
import { RigidBody } from '../bodies/RigidBody';
import { DefaultEventBus } from '../../../scene/events/DefaultEventBus';
import { ResourceSystem } from '../../../scene/systems/ResourceSystem';
import { World } from '../../../scene/world/World';
import { Time } from '../../../scene/time/Time';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { defaultCapabilities } from '../../../scene/__tests__/helpers/defaultCapabilities';
import { recordingFrame } from './helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../core/contracts/index';

/** Subclasse que expõe o aviso de excedente (protegido) para teste. */
class TestLCPFlow extends LCPFlow {
    overflow(count: number, overflow: number): void {
        this.reportContactOverflow(new Uint32Array([count, overflow, 0, 0]).buffer);
    }
}

function setup(bodies: number, options: { maxContactsPerBody?: number; maxBinding?: number } = {}) {
    const events = new DefaultEventBus();
    const world = new World(events);
    const fake = fakeResourceCore();
    if (options.maxBinding !== undefined) {
        const caps = defaultCapabilities();
        vi.mocked(fake.core.capabilities).mockReturnValue({
            ...caps,
            limits: { ...caps.limits, maxStorageBufferBindingSize: options.maxBinding },
        });
    }
    const resources = new ResourceSystem(fake.core, events, world);
    const time = new Time(events);
    world.insert(time);
    world.insert(new RigidBody({ shape: 'box', mass: 0, halfExtents: [10, 0.5, 10] }));
    for (let i = 0; i < bodies; i++) {
        world.insert(new RigidBody({ shape: 'sphere', radius: 0.3, mass: 1, position: [i, 2, 0] }));
    }
    const flow = new TestLCPFlow(fake.core, world, resources, {
        substeps: 2,
        ...(options.maxContactsPerBody !== undefined
            ? { maxContactsPerBody: options.maxContactsPerBody }
            : {}),
    });
    return { ...fake, world, time, flow };
}

const created = (core: ReturnType<typeof fakeResourceCore>['core'], prefix: string) =>
    vi
        .mocked(core.create)
        .mock.calls.map((c) => c[0] as StorageBufferSpec)
        .filter((s) => s.discriminator?.startsWith(prefix) === true);

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('LCPFlow — contatos compactados (R19)', () => {
    it('capacidade = min(N·M, N × maxContactsPerBody, limite de binding / 80)', () => {
        expect(setup(0).flow.contactCapacity(1000, 1001)).toBe(16_000);
        expect(setup(0, { maxContactsPerBody: 4 }).flow.contactCapacity(1000, 1001)).toBe(4000);
        expect(setup(0).flow.contactCapacity(3, 2)).toBe(6);
        expect(setup(0, { maxBinding: 8000 }).flow.contactCapacity(1000, 1001)).toBe(100);
    });

    it('buffers de contatos, bias e warm start dimensionados pela capacidade, não por N·M', () => {
        const s = setup(40);
        s.time.advance(1 / 60);
        s.flow.dispatch(recordingFrame().frame);
        // 41 corpos × 41 colliders; capacidade = 41 × 16 = 656 < 1681
        const capacity = 41 * 16;
        expect(created(s.core, 'lcp_contacts_')[0]!.byteSize).toBe(capacity * 80);
        expect(created(s.core, 'lcp_bvec_')[0]!.byteSize).toBe(capacity * 4);
        expect(created(s.core, 'lcp_warm_')[0]!.byteSize).toBe(2048 * 32); // 2^k ≥ 2C
        expect(created(s.core, 'lcp_contact_counter')[0]!.byteSize).toBe(16);
    });

    it('contador zerado antes da narrowphase de cada substep; acumulação com body_contact zerado antes do commit', () => {
        const s = setup(3);
        s.time.advance(1 / 60);
        const rec = recordingFrame();
        s.flow.dispatch(rec.frame);
        const seq = rec.sequence.filter(
            (e) =>
                e.startsWith('clear:')
                || e === 'pass:LCPFlow.narrowphase.BoxCollider'
                || e === 'pass:LCPFlow.solveLcp'
                || e === 'pass:LCPFlow.accumulate'
                || e === 'pass:LCPFlow.commit',
        );
        expect(seq).toEqual([
            'clear:lcp_contact_counter',
            'pass:LCPFlow.narrowphase.BoxCollider',
            'pass:LCPFlow.solveLcp',
            'clear:lcp_contact_counter',
            'pass:LCPFlow.narrowphase.BoxCollider',
            'pass:LCPFlow.solveLcp',
            expect.stringMatching(/^clear:lcp_body_contact_/),
            'pass:LCPFlow.accumulate',
            'pass:LCPFlow.commit',
        ]);
    });

    it('build percorre a capacidade (guarda pela contagem no shader)', () => {
        const s = setup(3);
        s.time.advance(1 / 60);
        const rec = recordingFrame();
        s.flow.dispatch(rec.frame);
        const build = rec.passes.find((p) => p.label === 'LCPFlow.buildLcp')!;
        expect(build.dispatches[0]).toEqual([4 * 4, 64]); // 4 corpos × 4 colliders = 16 < 4 × 16
    });

    it('contact_stamp cresce por substep e entra em cada região; capacidades nas regiões', () => {
        const s = setup(3);
        s.time.advance(2 / 60);
        s.flow.dispatch(recordingFrame().frame);
        const w = s.writes.find((x) =>
            (x.spec as { discriminator: string }).discriminator.includes('lcp_sim_params:per_step'),
        )!;
        const u32 = new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4);
        // 2 passos × (1 região de passo + 2 de substep) = 6 regiões de 256 B (64 u32)
        const stamps = [0, 1, 2, 3, 4, 5].map((r) => u32[r * 64 + 13]);
        expect(stamps).toEqual([0, 1, 2, 2, 3, 4]);
        expect(u32[64 + 6]).toBe(16); // max_contacts
        expect(u32[64 + 17]).toBe(32); // warm_capacity = 2^k ≥ 2 × 16
    });

    it('excedente de contatos gera um único aviso', () => {
        const s = setup(1);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        s.flow.overflow(10, 0);
        expect(warn).not.toHaveBeenCalled();
        s.flow.overflow(40, 8);
        s.flow.overflow(40, 9);
        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0]![0])).toMatch(/8 contatos acima da capacidade/);
    });
});
