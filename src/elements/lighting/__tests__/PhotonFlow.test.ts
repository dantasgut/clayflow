import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { registerPresentationDefaults } from '../../../presentation/flows/defaults';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Camera } from '../../scene/Camera';
import { DirectionalLight } from '../../scene/DirectionalLight';
import { Transform } from '../../scene/Transform';
import { GI_QUALITY, GlobalIllumination } from '../GlobalIllumination';
import { GI_PHOTON_BUFFER_WORDS, GI_PHOTON_SLOTS } from '../schemas';
import { giPhoton, giPhotonResolve, giPhotonTrace, giProbeTrace } from '../shaders';

// Cáusticas por fótons (spec 033, T051): o orçamento pela qualidade, o hash em mundo (descritor, baldes), os fótons
// mirados nas instâncias capazes de cáustica e escolhidos pela potência das fontes, o acúmulo, a coleta sem o caminho
// especular que os fótons levam e a água da 011 sem duplicar.

describe('Cáusticas por fótons (spec 033, T051)', () => {
    it('orçamento pela qualidade e o hash: descritor do tamanho dos baldes, só GPU', () => {
        expect(GI_QUALITY.low.photons).toBeLessThan(GI_QUALITY.medium.photons);
        expect(GI_QUALITY.medium.photons).toBeLessThan(GI_QUALITY.high.photons);
        expect(new GlobalIllumination({ quality: 'medium' }).data.photons).toBe(
            GI_QUALITY.medium.photons,
        );
        const caustics = new GlobalIllumination().getDescriptors().find((d) => d.id === 'caustics');
        expect(caustics).toMatchObject({
            role: 'storage-rw',
            upload: 'never',
            count: GI_PHOTON_BUFFER_WORDS,
        });
        expect(GI_PHOTON_BUFFER_WORDS).toBe(8 + 8 * GI_PHOTON_SLOTS);
    });

    it('fótons: alvos pelo material composto, fontes pela potência, sem duplicar a água; acúmulo com histerese', () => {
        const trace = composeWgsl(giPhotonTrace).spec.source;
        // Os alvos: um kernel lista as instâncias que fazem cáustica (o próprio fechamento) e as áreas por luz.
        expect(trace).toContain('fn gi_photon_targets_main(');
        expect(trace).toContain('gi_photon_caustic_capable(gi_hit_material(');
        // A fonte escolhida pela potência (direcional: a área das projeções dos alvos).
        expect(trace).toContain('fn gi_photon_power(i: u32) -> f32');
        expect(trace).toContain('weight = 1.0 / max(cover, 1.0);');
        // Na água (o volume de campo) o fóton para: as cáusticas dela são as da vista da luz (011).
        expect(trace).toContain('if (water.hit) { return; }');
        // Os meios atravessados (a névoa, spec 033 R12) atenuam o fóton em cada trecho.
        expect(trace).toContain('throughput *= ray_volume_transmittance(o, d, hit.t);');
        // Cada símbolo uma vez.
        expect(trace.match(/fn gi_photon_caustic_capable\(/g)).toHaveLength(1);
        expect(trace.match(/const GI_PHOTON_ROUGH/g)).toHaveLength(1);
        const resolve = composeWgsl(giPhotonResolve).spec.source;
        expect(resolve).toContain('mix(sum, old, GI_PHOTON_HYSTERESIS)');
        expect(composeWgsl(giPhoton).spec.source).toContain(
            'fn gi_caustic_irradiance(p: vec3f) -> vec3f',
        );
    });

    it('a coleta das sondas não lê o especular direto de vidro e metal liso com os fótons ligados', () => {
        const probe = composeWgsl(giProbeTrace).spec.source;
        expect(probe).toContain('if (gi.bounces.w != 0u && gi_photon_caustic_capable(c))');
    });

    it('o estágio: um passe de fótons por quadro com as cáusticas; desligadas, nenhum fóton nos parâmetros', async () => {
        const s = await renderScene();
        registerPresentationDefaults(s.scene.flows, {
            world: s.scene.world,
            events: s.scene.events,
        });
        const world = s.scene.world;
        world.insert(new Camera().add(new Transform({ position: [0, 1, 5, 1] })));
        world.insert(new DirectionalLight({ direction: [0, -1, 0, 0] }));
        world.insert(
            new BoxGeometry()
                .add(new StandardMaterial({ metallic: 1, roughness: 0.05 }))
                .add(new Transform()),
        );
        const gi = new GlobalIllumination({ quality: 'low' });
        world.insert(gi);
        s.step();
        s.step();
        expect(s.computes().filter((c) => c === 'ProbeFlow.photons')).toHaveLength(1);
        const params = (): { extra: number[]; bounces: number[]; counts: number[] } =>
            gi.data.params[0] as unknown as {
                extra: number[];
                bounces: number[];
                counts: number[];
            };
        expect(params().extra[2]).toBe(GI_QUALITY.low.photons);
        expect(params().bounces[3]).toBe(1);
        expect(params().counts[1]).toBe(GI_PHOTON_SLOTS);
        expect(s.core.readback).not.toHaveBeenCalled();
        gi.data.caustics = false;
        s.step();
        expect(params().extra[2]).toBe(0);
        expect(params().bounces[3]).toBe(0);
    });
});
