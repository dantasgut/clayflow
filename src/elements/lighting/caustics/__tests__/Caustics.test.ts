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
// contribuições ao desenho só ligado; a direta pela água em linha reta, os fótons a corrigem), os fótons (os alvos pelo
// material e pela caixa dos volumes, a grade de fótons por segmento, o acerto e o fechamento da refração, o Fresnel
// exato, os três canais pelo mesmo caminho, o pouso e a pegada pelos vizinhos da grade, a tenda 2D), o acúmulo e o
// estágio.

describe('Caustics (spec 034, T067c)', () => {
    it('o recurso: o hash só da GPU, as opções validadas, as contribuições só ligado', () => {
        const caustics = new Caustics();
        expect(caustics.enabled).toBe(true);
        expect(caustics.photons).toBe(65_536);
        expect(caustics.cellSize).toBe(0.005);
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

    it('os fótons: alvos pelo material e pela caixa dos volumes, grade, o acerto da refração, Fresnel exato, os canais pelo mesmo caminho, a pegada pela grade', () => {
        const trace = composeWgsl(causticsTrace).spec.source;
        expect(trace).toContain('fn caustics_targets_main(');
        // O material das instâncias numa invocação por instância, sem laço sobre elas; os alvos só leem o resultado.
        // As instâncias pela onda dos acertos (spec 039): o material fora do kernel, nenhuma função `material` nele.
        expect(trace).not.toContain('fn caustics_instances_main(');
        const instances = composeWgsl(causticsInstances).spec.source;
        expect(instances).toContain('ray_wave_put_surface(k, inst.ids.w & 0xFFFFu');
        expect(instances).toContain('caustics_capable(ray_wave_entries[k].closure)');
        expect(instances).not.toMatch(/\bray_hit_material\(|\bmaterial_fn_/);
        expect(instances.slice(instances.indexOf('fn caustics_instances_main('))).not.toMatch(
            /\b(for|loop|while)\b/,
        );
        const targets = trace.slice(
            trace.indexOf('fn caustics_targets_main('),
            trace.indexOf('fn caustics_segments_build('),
        );
        expect(targets).not.toContain('ray_hit_material(');
        expect(targets).toContain('if (caustics_instance_capable[k] == 0u) { continue; }');
        // A água entra nos alvos pela caixa dos volumes (sem saber quem é o volume).
        expect(trace).toContain('let vb = ray_volume_bounds();');
        // O mesmo acerto da refração (a malha ou a superfície do volume), gravado na onda; o fechamento avaliado fora
        // (spec 039): nenhum kernel dos fótons leva função `material` nem o seletor composto.
        expect(trace).toContain('let hit = refraction_scene_hit(ph.origin, ph.dir, 1e6, ph.side);');
        expect(trace).toContain('refraction_wave_put(j, hit, caustics.extra.y,');
        for (const entry of [
            'caustics_photon_hit_main',
            'caustics_photon_follow_main',
            'caustics_trace_main',
        ]) {
            const body = trace.slice(trace.indexOf(`fn ${entry}(`));
            expect(body.slice(0, body.indexOf('\n}\n'))).not.toMatch(
                /\bray_hit_material\(|\bmaterial_fn_|refraction_hit_closure\(/,
            );
        }
        expect(trace).not.toContain('if (water.hit) { return; }');
        // Fresnel exato entre os dois meios; os três canais pelo mesmo caminho, um fóton por canal só na dispersão (a
        // partir da interface, com o mesmo estado do sorteio).
        expect(trace).toContain('bsdf_f_dielectric(cosi, n2 / n1)');
        expect(trace).toContain('if (dispersive && ph.channel == 3u) {');
        expect(trace).toContain('channel.state = state;');
        // A grade dos fótons: segmentos por luz e alvo, a célula deslocada pelo mesmo sorteio do quadro em todo o
        // segmento; na caixa dos volumes, só os ladrilhos com água recebem fótons, e a célula que não passa pela água
        // (e que só ela cobre) não segue.
        expect(trace).toContain('let segment = caustics_segment_of(i);');
        expect(trace).toContain(
            'let cell = vec2f(f32(local % seg.w), f32(local / seg.w)) + caustics_grid_jitter(segment);',
        );
        expect(trace).toContain(
            'if (caustics_volume_tile_wet(normalize(lights[l].direction.xyz), volume - 1u, k % tiles)) {',
        );
        expect(trace).toContain(
            'if (volume && cover <= 1.0 && !ray_volume_occupied(o, d, 2.0 * back)) { return; }',
        );
        // Os trechos atenuam pelo meio em que o fóton está, analítico pelo comprimento (T110: a absorção guardada ao
        // entrar pela superfície, zerada ao sair): dentro de uma malha a dela, por Beer–Lambert como a refração (a malha
        // sem a cor só ao sair: o pouso dentro dela ficava sem absorção); fora, a da água; o depósito pela tenda 2D no
        // plano tangente.
        expect(trace).toContain(
            'let sigma = select(ph.absorption, ph.glass_absorption, ph.glass != 0u);',
        );
        expect(trace).toContain(
            'caustics_photons[slot].throughput = ph.throughput * exp(-sigma * hit.t);',
        );
        expect(trace).toContain(
            'ph.glass_absorption = select(vec3f(0.0), closure_absorption(c), outside);',
        );
        expect(trace).not.toContain('ph.throughput *= c.transmission_color;');
        expect(trace).toContain(
            'ph.absorption = select(vec3f(0.0), closure_absorption(c), outside);',
        );
        expect(trace).not.toContain('ray_volume_transmittance(');
        // O pouso guarda o ponto e a assinatura do caminho; a pegada pelos vizinhos da grade de mesma assinatura, no
        // mínimo o borrão do disco da luz pelo último trecho; o depósito no nível do tamanho dela, pela tenda 2D, com a
        // vazão por área da superfície (T057: a área da célula é a projetada no plano das camadas).
        expect(trace).toContain('ph.landed = 1u;');
        expect(trace).toContain('if (o.landed == 0u || o.sig != ph.sig');
        expect(trace).toContain('let blur = 2.0 * lights[seg.light].cones.z * ph.land_t;');
        expect(trace).toContain(
            'caustics_splat(ph.land, ph.land_n, e1.xyz, e2.xyz, ph.throughput, blur);',
        );
        // A parte que não achou balde na faixa cheia do nível sobe ao de cima (o fluxo se conserva).
        expect(trace).toContain(
            'if (!caustics_deposit_cell(caustics_tent_cell(t, k), l, part * t.cosine)) { lost += part; }',
        );
        expect(trace).toContain('let h = p[a] - (n[u] * (cu - p[u]) + n[v] * (cv - p[v])) / n[a];');
        // A variável de controle: a direta em linha reta subtraída onde a linha reta do fóton chega depois da água, na
        // pegada exata da célula da grade.
        expect(trace).toContain('-light_rgb * light_transmission(light, straight.position), 0.0);');
        expect(trace).toContain(
            'bitcast<vec3u>(vec3i(round(clamp(rgb, vec3f(-16.0), vec3f(16.0)) * CAUSTICS_ONE)))',
        );
        expect(trace.match(/fn caustics_capable\(/g)).toHaveLength(1);
        expect(trace.match(/const CAUSTICS_ROUGH/g)).toHaveLength(1);
        const resolve = composeWgsl(causticsResolve).spec.source;
        expect(resolve).toContain('mix(sum, old, CAUSTICS_HYSTERESIS)');
        expect(resolve).toContain('let sum = vec3f(bitcast<vec3i>(vec3u(');
        // A área da célula do nível da faixa do balde.
        expect(resolve).toContain('let cell = caustics_cell_size(slot / caustics_level_slots());');
        const light = composeWgsl(causticsLight).spec.source;
        expect(light).toContain('fn caustics_irradiance(p: vec3f, n: vec3f) -> vec3f');
        // A leitura: a soma dos níveis, cada um pela tenda a partir da âncora.
        expect(light).toContain('let t = caustics_tent(q, n, level);');
        expect(light).toContain('let q = p - anchor;');
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
