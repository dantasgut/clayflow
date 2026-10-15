/**
 * Spec 009 (US3): função `material` — a entidade com `MaterialFunction` desenha com a variante do pipeline do material
 * (adaptador da função) depois de compilada; antes, com o pipeline do material; sem função, nada muda.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Camera } from '../../scene/Camera';
import { Transform } from '../../scene/Transform';
import { MaterialFunction } from '../MaterialFunction';
import {
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

const CHECKER = `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    let cell = vec2i(floor(s.uv * data.cells));
    let dark = ((cell.x + cell.y) & 1) == 1;
    return SurfaceParams(vec4f(select(m.albedo.rgb, m.albedo.rgb * 0.15, dark), m.albedo.a), 0.5, 0.0, vec3f(0.0));
}`;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MaterialFunction (spec 009)', () => {
    it('desenha com a variante da função depois de compilada; o grupo separa entidades com e sem função', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'canvas' });
        s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.scene.world.insert(
            new BoxGeometry()
                .add(new StandardMaterial())
                .add(new Transform())
                .add(
                    new MaterialFunction({
                        code: CHECKER,
                        params: { cells: 'f32' },
                        values: { cells: 8 },
                    }),
                ),
        );
        s.step();
        for (let i = 0; i < 30; i++) await Promise.resolve();
        const passes = s.step();
        const forward = passes.find((p) => p.label === 'ForwardFlow');
        const ids = forward?.draws.map((d) => d.pipeline.discriminator) ?? [];
        expect(passes.map((p) => p.label)).toContain('ForwardFlow');
        expect(ids).toHaveLength(2);
        expect(ids.some((id) => id?.includes('|material:') === true)).toBe(true);
        expect(ids.some((id) => id?.includes('|material:') !== true)).toBe(true);
    });
});
