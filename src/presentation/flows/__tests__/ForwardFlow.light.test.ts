/**
 * Spec 007 (US6) e 031 (R4): o render principal lê a direção da luz no pool `Light` e a sombra do mapa da direcional
 * que projeta — nenhum dado da luz é lido na CPU nem passa pelos parâmetros do quadro. A luz chega pelos pontos de cena
 * `scene_light_direction` e `light_visibility`, compostos pela C2 com a contribuição da luz (pelos slots dela); sem luz
 * que projeta sombra, os prontos (direção padrão, visibilidade 1).
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
    it('a direção vem do slot no pool Light da direcional que projeta; a sombra do slot do mapa dela', async () => {
        const s = await scene(true);
        s.step();
        s.step();
        s.step();
        const rs = s.scene.resourceSystem;
        const src = forwardSource(s);
        expect(src).toContain(
            `return lights[${rs.poolSlotOf('Light', s.lightId)}u].direction.xyz;`,
        );
        expect(src).toContain(`let sm = shadow_maps[${rs.poolSlotOf('ShadowMap', s.lightId)}u];`);
        expect(src).toContain('sample_shadow_pcf(shadow_map, shadow_sampler');
    });

    it('sem direcional que projeta sombra: a direção padrão e visibilidade 1 (os prontos)', async () => {
        const s = await scene(false);
        s.step();
        s.step();
        const src = forwardSource(s);
        expect(src).toContain('return DEFAULT_LIGHT_DIRECTION;');
        expect(src).toMatch(
            /fn light_visibility\(p: vec3f, n_dot_l: f32\) -> f32 \{\s*return 1\.0;/,
        );
        expect(src).not.toMatch(/var shadow_map|shadow_maps\[/);
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
