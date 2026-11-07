/**
 * Spec 007 (US6), 031 (R4) e 011 (R7): o render principal não conhece luz nenhuma — nenhum dado da luz é lido na CPU nem
 * passa pelos parâmetros do quadro. A luz chega pelo ponto de cena `scene_lighting` (o laço das luzes do pool, composto
 * uma vez pela C2) e a sombra por `light_visibility`, só para a luz que projeta (pelos slots dela); sem luz que projeta
 * sombra, a visibilidade pronta (1).
 */
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

async function scene(castShadow: boolean) {
    const s = await renderScene();
    registerStages(s.scene, { shadow: true, forward: 'canvas' });
    s.scene.world.insert(new Camera().add(new Transform({ position: [0, 2, 6, 1] })));
    s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: false }));
    const light = new DirectionalLight({ direction: [0.3, -1, 0.2, 0], castShadow });
    const lightId = s.scene.world.insert(light);
    s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
    return { ...s, light, lightId };
}

/** Fonte do shader do desenho forward mais recente. */
function forwardSource(s: Awaited<ReturnType<typeof scene>>): string {
    const draw = s.draws('ForwardFlow').at(-1)!;
    return draw.pipeline.vertex.shader.source;
}

describe('ForwardFlow — luz pelos pontos de cena (spec 007, 031)', () => {
    it('as luzes pelo laço do pool (uma vez para as duas direcionais); a sombra só para a luz que projeta', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        s.step();
        const rs = s.scene.resourceSystem;
        const src = forwardSource(s);
        expect(
            // As luzes e os vivos lidos pela arena de pools (T060i): os acessores no lugar dos arrays.
            src.match(/if \(!pool_live\(light_live_at\(i >> 5u\), i\)\) \{ continue; \}/g),
        ).toHaveLength(1);
        expect(src).toContain(
            `if (light != ${rs.poolSlotOf('Light', s.lightId)}u) { return 1.0; }`,
        );
        expect(src).toContain(
            `let sm = shadow_maps_at(${rs.poolSlotOf('ShadowMap', s.lightId)}u);`,
        );
        // O atlas em buffer (T060h): a tabela e as páginas lidas de `shadow_atlas`, sem textura nem amostrador.
        expect(src).toContain('shadow_virtual_visibility(matrix, p, n, l,');
        expect(src).toMatch(/var<storage, read> shadow_atlas: array<u32>/);
        expect(src).not.toMatch(/texture_depth_2d|sampler_comparison/);
        expect(src).not.toContain('scene_light_direction');
    });

    it('sem direcional que projeta sombra: visibilidade 1 (o pronto)', async () => {
        const s = await scene(false);
        s.step();
        s.step();
        const src = forwardSource(s);
        expect(src).toMatch(
            /fn light_visibility\(light: u32, p: vec3f, n: vec3f\) -> f32 \{\s*return 1\.0;/,
        );
        expect(src).not.toMatch(/shadow_atlas|shadow_maps\[/);
    });

    it('nenhuma escrita dos parâmetros do quadro sem mudança — nem quando a direção da luz muda', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        const writes = (): number =>
            vi
                .mocked(s.core.write)
                .mock.calls.filter(([spec]) => discOf(spec) === 'forward_frame_params').length;
        const before = writes();
        s.step();
        s.light.data.direction = [0.5, -1, 0, 0];
        s.step();
        s.step();
        expect(writes()).toBe(before);
    });
});
