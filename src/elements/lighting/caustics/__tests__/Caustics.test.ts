import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import { registerPresentationDefaults } from '../../../../presentation/flows/defaults';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';
import { BoxGeometry } from '../../../geometry/BoxGeometry';
import { StandardMaterial } from '../../../material/StandardMaterial';
import { Camera } from '../../../scene/Camera';
import { DirectionalLight } from '../../../scene/DirectionalLight';
import { Transform } from '../../../scene/Transform';
import { GlobalIllumination } from '../../GlobalIllumination';
import { giProbeTrace } from '../../shaders';
import { Caustics } from '../Caustics';
import { CAUSTICS_BUFFER_WORDS, CAUSTICS_SLOTS } from '../schemas';
import {
    causticsInstances,
    causticsLight,
    causticsRayLight,
    causticsResolve,
    causticsTrace,
} from '../shaders';

// O transporte das cáusticas (spec 034, T067c; antes dentro da GI, spec 033 T051): o recurso (o hash, as opções, as
// contribuições ao desenho só ligado; a direta pela água em linha reta, os fótons a corrigem), os fótons (os alvos pelo material e pela caixa dos volumes, o acerto e o
// fechamento da refração, o Fresnel exato, os três canais pelo mesmo caminho, a tenda 2D), o acúmulo e o estágio.

describe('Caustics (spec 034, T067c)', () => {
    it('o recurso: o hash só da GPU, as opções validadas, as contribuições só ligado', () => {
        const caustics = new Caustics();
        expect(caustics.enabled).toBe(true);
        expect(caustics.photons).toBe(65_536);
        expect(caustics.cellSize).toBe(0.01);
        expect(caustics.getDescriptors().find((d) => d.id === 'hash')).toMatchObject({
            role: 'storage-rw',
            upload: 'never',
            count: CAUSTICS_BUFFER_WORDS,
        });
        expect(() => new Caustics({ photons: -1 })).toThrow(RangeError);
        expect(() => new Caustics({ cellSize: 0 })).toThrow(RangeError);
        const built = caustics.getSceneContributions().map((c) => c.build(() => undefined));
        expect(built).toEqual([causticsLight, causticsRayLight]);
        caustics.enabled = false;
        expect(caustics.getSceneContributions().map((c) => c.build(() => undefined))).toEqual([
            undefined,
            undefined,
        ]);
    });

    it('os fótons: alvos pelo material e pela caixa dos volumes, o acerto da refração, Fresnel exato, os canais pelo mesmo caminho, tenda 2D', () => {
        const trace = composeWgsl(causticsTrace).spec.source;
        expect(trace).toContain('fn caustics_targets_main(');
        // O material das instâncias numa invocação por instância, sem laço sobre elas; os alvos só leem o resultado.
        // As instâncias pela onda dos acertos (spec 039): o material fora do kernel, nenhuma função `material` nele.
        expect(trace).not.toContain('fn caustics_instances_main(');
        const instances = composeWgsl(causticsInstances).spec.source;
        expect(instances).toContain('ray_wave_put_surface(k, inst.ids.w & 0xFFFFu');
        expect(instances).toContain('caustics_capable(ray_wave_surfaces[k])');
        expect(instances).not.toMatch(/\bray_hit_material\(|\bmaterial_fn_/);
        expect(instances.slice(instances.indexOf('fn caustics_instances_main('))).not.toMatch(
            /\b(for|loop|while)\b/,
        );
        const targets = trace.slice(
            trace.indexOf('fn caustics_targets_main('),
            trace.indexOf('fn caustics_deposit('),
        );
        expect(targets).not.toContain('ray_hit_material(');
        expect(targets).toContain('if (caustics_instance_capable[k] == 0u) { continue; }');
        // A água entra nos alvos pela caixa dos volumes (sem saber quem é o volume).
        expect(trace).toContain('let vb = ray_volume_bounds();');
        // O mesmo acerto e fechamento da refração (a malha ou a superfície do volume).
        expect(trace).toContain('let hit = refraction_scene_hit(o, d, 1e6, side);');
        expect(trace).toContain('let c = refraction_hit_closure(hit, caustics.extra.y);');
        expect(trace).not.toContain('if (water.hit) { return; }');
        // Fresnel exato entre os dois meios; os três canais pelo mesmo caminho, um passe por canal só na dispersão.
        expect(trace).toContain('bsdf_f_dielectric(cosi, n2 / n1)');
        expect(trace).toContain('if (channel == 3u) { return true; }');
        expect(trace).toContain('let split = caustics_follow(seed, o, d, rgb, channel);');
        expect(trace.match(/= caustics_follow\(seed/g)).toHaveLength(1);
        // Na caixa dos volumes, as amostras que não passam pela água (e que só ela cobre) não seguem.
        expect(trace).toContain(
            'if (volume && cover <= 1.0 && !ray_volume_occupied(o, d, 2.0 * back)) { continue; }',
        );
        // Os trechos atenuam pelos volumes; o depósito pela tenda 2D no plano tangente.
        expect(trace).toContain(
            'throughput *= ray_volume_transmittance(o, d, hit.t, caustics.extra.y);',
        );
        // Em todos os níveis de células, com o peso da tenda como a contagem do fóton.
        expect(trace).toContain('let t = caustics_tent(p, n, level);');
        expect(trace).toContain(
            'caustics_deposit_cell(caustics_tent_cell(t, k), level, rgb * w, w * share);',
        );
        // A variável de controle: a direta em linha reta subtraída onde a linha reta do fóton chega depois da água.
        expect(trace).toContain(
            'caustics_deposit(straight.position, straight.normal, -light_rgb * light_transmission(light, straight.position), 1.0);',
        );
        expect(trace).toContain(
            'bitcast<vec3u>(vec3i(round(clamp(rgb, vec3f(-16.0), vec3f(16.0)) * CAUSTICS_ONE)))',
        );
        expect(trace.match(/fn caustics_capable\(/g)).toHaveLength(1);
        expect(trace.match(/const CAUSTICS_ROUGH/g)).toHaveLength(1);
        const resolve = composeWgsl(causticsResolve).spec.source;
        expect(resolve).toContain('mix(sum, old, CAUSTICS_HYSTERESIS)');
        expect(resolve).toContain('let sum = vec3f(bitcast<vec3i>(vec3u(');
        // A área da célula do nível da chave.
        expect(resolve).toContain('let cell = caustics_cell_size(caustics_key_level(key));');
        const light = composeWgsl(causticsLight).spec.source;
        expect(light).toContain('fn caustics_irradiance(p: vec3f, n: vec3f) -> vec3f');
        // A leitura adaptativa: o nível mais fino com fótons acumulados bastantes, misturado com o de baixo pela fração deles.
        expect(light).toContain('let t = caustics_tent(p, n, level);');
        expect(light).toContain('e.a * (1.0 + CAUSTICS_HYSTERESIS) / (1.0 - CAUSTICS_HYSTERESIS)');
        expect(light).toContain(
            'mix(here.rgb, finer.rgb, clamp(finer.a / CAUSTICS_MIN_PHOTONS, 0.0, 1.0))',
        );
        // Com sinal: sob a água, a irradiância corrige a direta em linha reta.
        expect(light).toContain('if (all(e == vec3f(0.0))) { return vec3f(0.0); }');
    });

    it('a coleta das sondas da GI não lê o especular direto de vidro e metal liso com as cáusticas ativas', () => {
        expect(composeWgsl(giProbeTrace).spec.source).toContain(
            'if (gi.bounces.w != 0u && caustics_capable(c))',
        );
    });

    it('o estágio: um passe por quadro ligado, nenhum desligado; a GI sabe das cáusticas ativas', async () => {
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
        const caustics = new Caustics({ photons: 65_536 });
        world.insert(caustics);
        s.step();
        s.step();
        expect(s.computes().filter((c) => c === 'CausticsFlow')).toHaveLength(1);
        const params = (): { counts: number[] } =>
            caustics.data.params[0] as unknown as { counts: number[] };
        const bounces = (): number[] =>
            (gi.data.params[0] as unknown as { bounces: number[] }).bounces;
        expect(params().counts[1]).toBe(CAUSTICS_SLOTS);
        expect(params().counts[2]).toBe(65_536);
        expect(bounces()[3]).toBe(1);
        expect(s.core.readback).not.toHaveBeenCalled();
        caustics.enabled = false;
        s.step();
        expect(params().counts[2]).toBe(0);
        expect(bounces()[3]).toBe(0);
    });
});
