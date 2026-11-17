import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BindingLayoutEntry } from '../../../scene/contracts/gpu';
import type * as LimitsModule from '../../../scene/systems/flowBinding/limits';
import { renderScene } from './helpers/renderHarness';
import { registerPresentationDefaults } from '../defaults';
import { defaultCapabilities } from '../../../scene/__tests__/helpers/defaultCapabilities';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { Sky } from '../../../elements/scene/sky/Sky';
import { FogVolume } from '../../../elements/media/FogVolume';
import { GlobalIllumination } from '../../../elements/lighting/GlobalIllumination';
import { CloudLayer } from '../../../elements/media/clouds/CloudLayer';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_add(closure_dielectric(1.5, vec3f(1.0), 0.0, 0.0, vec3f(0.0)), closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0));
}`;

// Ligações por estágio (spec 041, T002/T030): a composição real de cada pipeline que lê a luz — o forward, a injeção
// dos froxels, o traçado da GI e o da refração — contada pela C2 (o layout que ela confere contra os limites do
// adaptador em `flowBinding/limits.ts`). O teste registra as contagens (na saída) e confere que cabem nos limites do
// adaptador do teste; a contagem não é congelada.

interface Counted {
    readonly label: string;
    readonly counts: Record<string, number>;
}

const recorded: Counted[] = [];

vi.mock('../../../scene/systems/flowBinding/limits', async (original) => {
    const real = await original<typeof LimitsModule>();
    return {
        checkLayoutLimits: (
            label: string,
            groups: readonly (readonly BindingLayoutEntry[])[],
            limits: Readonly<Record<string, number>>,
        ): void => {
            const counts: Record<string, number> = {};
            for (const g of groups)
                for (const e of g) {
                    const k =
                        e.kind === 'buffer'
                            ? e.type === 'uniform'
                                ? 'uniform'
                                : 'storage'
                            : e.kind === 'storage-texture'
                              ? 'storageTexture'
                              : e.kind === 'texture'
                                ? 'sampled'
                                : e.kind;
                    counts[k] = (counts[k] ?? 0) + 1;
                }
            recorded.push({ label, counts });
            real.checkLayoutLimits(label, groups, limits);
        },
    };
});

/** Os pipelines que leem a luz da cena (os que ganham as contribuições das nuvens). */
const LIGHT_READERS = /forward|froxel_inject|gi_.*trace|refraction_path/;

let lastComputes: readonly string[] = [];
let allLabels: string[] = [];

async function countScene(withClouds: boolean): Promise<Map<string, Record<string, number>>> {
    recorded.length = 0;
    const s = await renderScene();
    registerPresentationDefaults(s.scene.flows, { world: s.scene.world, events: s.scene.events });
    const world = s.scene.world;
    world.insert(new Camera().add(new Transform({ position: [0, 1, 5, 1] })));
    const sun = new DirectionalLight({ direction: [-0.3, -0.8, -0.5, 0] });
    world.insert(sun);
    world.insert(new Sky({ sun }));
    world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
    world.insert(new FogVolume({ density: 0.02 }));
    world.insert(
        new BoxGeometry()
            .add(new StandardMaterial())
            .add(new Transform({ position: [2, 0, 0, 1] }))
            .add(new MaterialFunction({ code: GLASS, lobes: ['specular', 'transmission'] })),
    );
    world.insert(new GlobalIllumination());
    const layer = withClouds ? new CloudLayer() : undefined;
    if (layer !== undefined) world.insert(layer);
    for (let k = 0; k < 6; k++) {
        s.step();
        for (let i = 0; i < 30; i++) await Promise.resolve();
    }
    lastComputes = s.computes();
    allLabels = recorded.map((r) => r.label);
    const out = new Map<string, Record<string, number>>();
    for (const r of recorded) if (LIGHT_READERS.test(r.label)) out.set(r.label, r.counts);
    return out;
}

describe('ligações por estágio (spec 041)', () => {
    afterEach(() => {
        recorded.length = 0;
    });

    it('a composição real dos estágios que leem a luz cabe nos limites do adaptador, com e sem nuvens', async () => {
        // Arrange + Act
        const before = await countScene(false);
        const after = await countScene(true);
        const limits = defaultCapabilities().limits;
        // Registro das contagens (antes → depois) na saída do teste.
        for (const [label, counts] of after)
            console.log(
                `[ligações] ${label}: ${JSON.stringify(before.get(label) ?? {})} → ${JSON.stringify(counts)}`,
            );
        // Assert: há estágios que leem a luz e todos cabem (a C2 lança `limit-exceeded` no contrário).
        expect([...after.keys()].some((l) => l.includes('froxel_inject'))).toBe(true);
        expect([...after.keys()].some((l) => l.includes('gi_trace'))).toBe(true);
        for (const counts of after.values()) {
            expect(counts.storage ?? 0).toBeLessThanOrEqual(
                limits.maxStorageBuffersPerShaderStage ?? Infinity,
            );
            expect(counts.sampled ?? 0).toBeLessThanOrEqual(
                limits.maxSampledTexturesPerShaderStage ?? Infinity,
            );
        }
    });
});

describe('custo zero sem camada de nuvens (spec 041, T035)', () => {
    it('sem CloudLayer, nenhum pipeline nem passe das nuvens; com ela, os passes existem', async () => {
        await countScene(false);
        expect(allLabels.some((l) => l.includes('Cloud'))).toBe(false);
        expect(lastComputes.some((c) => c.startsWith('Cloud'))).toBe(false);
        await countScene(true);
        expect(lastComputes.some((c) => c.startsWith('CloudFlow.march'))).toBe(true);
    });
});
