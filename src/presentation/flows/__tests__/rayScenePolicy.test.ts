import { describe, expect, it } from 'vitest';
import { renderScene } from './helpers/renderHarness';
import { registerPresentationDefaults } from '../defaults';
import { RayScene } from '../../../elements/raytrace/RayScene';
import { Refraction } from '../../../elements/material/Refraction';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Transform } from '../../../elements/scene/Transform';
import { MaterialFunction } from '../../../elements/extension/MaterialFunction';
import { GlobalIllumination } from '../../../elements/lighting/GlobalIllumination';

// A estrutura de raios por evento (spec 034, T021): os estágios padrão a inserem quando entra quem traça raios (um
// transmissivo, a água, a iluminação global) e tiram a que inseriram quando sai o último; a `Refraction` está sempre.

const GLASS = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    return closure_transmission(1.5, vec3f(1.0), 0.0, 0.0, 0.0);
}`;

describe('estágios padrão — estrutura de raios e refração (spec 034)', () => {
    it('um transmissivo insere a RayScene; sair o último a retira; um opaco com função não', async () => {
        const s = await renderScene();
        const defaults = registerPresentationDefaults(s.scene.flows, {
            world: s.scene.world,
            events: s.scene.events,
        });
        const world = s.scene.world;
        const rays = (): number => world.queryBySchemaName(RayScene.schema.name).length;
        expect(world.entityIdOfResource(defaults.refraction)).toBeDefined();
        expect(defaults.refraction).toBeInstanceOf(Refraction);
        expect(rays()).toBe(0);
        const plain = new SphereGeometry()
            .add(new StandardMaterial())
            .add(new Transform())
            .add(
                new MaterialFunction({
                    code: 'fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    return closure_diffuse(m.albedo.rgb, 0.0);\n}',
                    lobes: ['diffuse'],
                }),
            );
        world.insert(plain);
        expect(rays()).toBe(0);
        const glass = new SphereGeometry()
            .add(new StandardMaterial())
            .add(new Transform())
            .add(new MaterialFunction({ code: GLASS, lobes: ['transmission'] }));
        world.insert(glass);
        expect(rays()).toBe(1);
        const gi = new GlobalIllumination();
        world.insert(gi);
        expect(rays()).toBe(1);
        world.remove(glass);
        expect(rays()).toBe(1);
        world.remove(gi);
        expect(rays()).toBe(0);
    });
});
