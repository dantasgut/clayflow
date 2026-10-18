import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { SphereGeometry } from '../../geometry/SphereGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Transform } from '../../scene/Transform';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { RayScene } from '../RayScene';
import { RaySceneFlow } from '../RaySceneFlow';
import { RAY_WORDS } from '../schemas';
import { MaterialFunction } from '../../extension/MaterialFunction';
import { FluidSurfaceMaterial } from '../../material/FluidSurfaceMaterial';
import { PointSpriteMaterial } from '../../material/PointSpriteMaterial';
import { FluidBody } from '../../physics/bodies/FluidBody';
import { composeWgsl } from '../../../scene/shaders/composeWgsl';
import { bindPoints } from '../../../scene/shaders/bindPoints';
import { composeHitMaterial } from '../../lighting/ProbeFlow';
import { giHitMaterialPoint, giProbeTrace } from '../../lighting/shaders';

// Estrutura de raios (spec 033, T007): descritores, uma hierarquia de baixo por conteúdo de geometria, construção uma
// vez, hierarquia de cima a cada quadro, crescimento das capacidades.

type Harness = Awaited<ReturnType<typeof renderScene>> & { flow: () => RaySceneFlow };

async function sceneWith(count: number, shared = true): Promise<Harness> {
    const s = await renderScene();
    let flow: RaySceneFlow | undefined;
    s.scene.flows.register((ctx) => (flow = new RaySceneFlow(ctx)), {
        type: 'rayScene',
        phase: 'transform',
    });
    s.scene.world.insert(new RayScene());
    for (let i = 0; i < count; i++) {
        const geometry = shared
            ? new BoxGeometry()
            : new BoxGeometry({ size: [1 + i * 0.01, 1, 1] });
        s.scene.world.insert(
            geometry.add(new StandardMaterial()).add(new Transform({ position: [i * 3, 0, 0, 1] })),
        );
    }
    return { ...s, flow: () => flow! };
}

const count = (labels: readonly string[], label: string): number =>
    labels.filter((l) => l === label).length;

describe('RayScene e RaySceneFlow (spec 033, T007)', () => {
    it('descritores: o uniform da estrutura e os dois pools de palavras, escritos só pela GPU', () => {
        const scene = new RayScene();
        const byId = new Map(scene.getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('info')).toMatchObject({ role: 'uniform' });
        for (const id of ['geometry', 'bvh']) {
            expect(byId.get(id)).toMatchObject({
                storage: 'pool',
                upload: 'never',
                role: 'storage-rw',
            });
        }
        const d = scene.data;
        expect(byId.get('bvh')?.count).toBe(
            RAY_WORDS.node * d.nodes + RAY_WORDS.blas * d.blas + RAY_WORDS.instance * d.instances,
        );
        expect(byId.get('geometry')?.count).toBe(
            RAY_WORDS.vertex * d.vertices
                + RAY_WORDS.triangle * d.triangles
                + RAY_WORDS.sphere * d.spheres,
        );
    });

    it('reserve cresce por potências de dois e só quando passa da capacidade', () => {
        const scene = new RayScene();
        const before = scene.data.triangles;
        expect(
            scene.reserve({
                vertices: 1,
                triangles: before,
                spheres: 1,
                nodes: 1,
                blas: 1,
                instances: 1,
            }),
        ).toBe(false);
        expect(
            scene.reserve({
                vertices: 1,
                triangles: before + 1,
                spheres: 1,
                nodes: 1,
                blas: 1,
                instances: 1,
            }),
        ).toBe(true);
        expect(scene.data.triangles).toBe(before * 2);
    });

    it('conteúdo compartilhado: uma hierarquia de baixo construída uma vez; a de cima a cada quadro', async () => {
        const s = await sceneWith(3);
        s.step();
        // Um passe para as hierarquias de baixo e um para a de cima.
        expect(count(s.computes(), 'RaySceneFlow.blas')).toBe(1);
        expect(count(s.computes(), 'RaySceneFlow.tlas')).toBe(1);
        expect(s.flow().lastFrame).toMatchObject({
            built: 1,
            refit: 0,
            instances: 3,
            tlasRebuilt: true,
        });
        s.step();
        // Malha parada: nada de baixo é refeito; a de cima acompanha as matrizes.
        expect(count(s.computes(), 'RaySceneFlow.blas')).toBe(0);
        expect(count(s.computes(), 'RaySceneFlow.tlas')).toBe(1);
        expect(s.flow().lastFrame).toMatchObject({
            built: 0,
            refit: 0,
            instances: 3,
            tlasRebuilt: false,
        });
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('conteúdos diferentes: uma hierarquia por conteúdo; uma entidade nova constrói só a sua', async () => {
        const s = await sceneWith(2, false);
        s.step();
        expect(s.flow().lastFrame.built).toBe(2);
        s.scene.world.insert(
            new BoxGeometry({ size: [7, 1, 1] }).add(new StandardMaterial()).add(new Transform()),
        );
        s.step();
        expect(s.flow().lastFrame.built).toBe(1);
    });

    it('corpos de sprites: esferas reajustadas a cada quadro, topologia nova a cada 8; a água fica de fora', async () => {
        const s = await sceneWith(1);
        const sprites = new FluidBody({
            algorithm: 'SPH',
            position: [0, 0, 0, 0.1, 0, 0, 0.2, 0, 0],
        }).add(new PointSpriteMaterial({ radius: 0.05, color: [1, 0.5, 0.25, 1] }));
        s.scene.world.insert(sprites);
        s.scene.world.insert(
            new FluidBody({ algorithm: 'SPH', position: [5, 0, 0] }).add(
                new FluidSurfaceMaterial(),
            ),
        );
        s.step();
        // A caixa e as esferas construídas; a água não entra.
        expect(s.flow().lastFrame).toMatchObject({ built: 2, refit: 0, instances: 2 });
        const ray = s.scene.world.findResource(RayScene.schema, RayScene)!;
        expect(ray.data.spheres).toBeGreaterThanOrEqual(3);
        const frames = Array.from({ length: 9 }, () => {
            s.step();
            return { ...s.flow().lastFrame };
        });
        // Partículas andam: reajuste por quadro; a cada 8 reajustes, a topologia de novo.
        expect(frames.slice(0, 8).every((f) => f.built === 0 && f.refit === 1)).toBe(true);
        expect(frames[8]).toMatchObject({ built: 1, refit: 0 });
        s.scene.world.remove(sprites);
        s.step();
        expect(s.flow().lastFrame).toMatchObject({ built: 0, refit: 0, instances: 1 });
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('sem RayScene na cena o estágio não grava nada', async () => {
        const s = await renderScene();
        s.scene.flows.register((ctx) => new RaySceneFlow(ctx), {
            type: 'rayScene',
            phase: 'transform',
        });
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.step();
        expect(s.computes().filter((c) => c.startsWith('RaySceneFlow')).length).toBe(0);
    });

    it('crescer além da capacidade reconstrói tudo (os pools foram realocados)', async () => {
        const s = await sceneWith(1, false);
        s.step();
        s.scene.world.insert(
            new SphereGeometry({ latSegments: 64, lonSegments: 128 })
                .add(new StandardMaterial())
                .add(new Transform()),
        );
        s.step();
        expect(s.flow().lastFrame.built).toBe(2);
    });

    it('muitas geometrias: as capacidades crescem e o uniform aponta a raiz da hierarquia de cima', async () => {
        const s = await sceneWith(40, false);
        s.step();
        const scene = s.scene.world
            .queryBySchemaName(RayScene.schema.name)
            .flatMap((id) => s.scene.world.resourcesOf(id))
            .find((r) => r instanceof RayScene)!;
        expect(scene.data.instanceCount).toBe(40);
        expect(scene.data.blas).toBeGreaterThanOrEqual(40);
        expect(scene.data.tlasRoot).toBeGreaterThan(0);
        expect(scene.data.nodes).toBeGreaterThanOrEqual(scene.data.tlasRoot + 2 * 40 - 1);
    });

    it('funções `material` nos acertos (T025): uma por código, renomeadas pelo hash, compostas num kernel; as de derivada de tela ficam de fora', async () => {
        const s = await renderScene();
        s.scene.flows.register((ctx) => new RaySceneFlow(ctx), {
            type: 'rayScene',
            phase: 'transform',
        });
        const rayScene = new RayScene();
        s.scene.world.insert(rayScene);
        const fn = (body: string): MaterialFunction =>
            new MaterialFunction({
                code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n    ${body}\n}`,
            });
        const diffuse = 'return closure_diffuse(m.albedo.rgb, 0.0);';
        const glow =
            'return closure_add(closure_diffuse(m.albedo.rgb, 0.0), closure_emission(vec3f(2.0), 1.0));';
        const screen = 'let w = fwidth(s.uv.x);\n    return closure_diffuse(vec3f(w), 0.0);';
        // Duas entidades com o mesmo código (uma função), uma com outro código e uma que lê derivadas de tela.
        for (const body of [diffuse, diffuse, glow, screen])
            s.scene.world.insert(
                new BoxGeometry().add(new StandardMaterial()).add(new Transform()).add(fn(body)),
            );
        s.step();
        const fns = rayScene.materialFunctions;
        expect(fns).toHaveLength(2);
        expect(new Set(fns.map((f) => f.functionName)).size).toBe(2);
        expect(fns.every((f) => /^material_fn_[0-9a-f]+$/.test(f.functionName))).toBe(true);
        // As duas compõem juntas no kernel dos raios das sondas, sem símbolos repetidos.
        const source = composeWgsl(
            bindPoints(giProbeTrace, new Map([[giHitMaterialPoint, composeHitMaterial(fns)]])),
        ).spec.source;
        for (const f of fns) expect(source).toContain(`fn ${f.functionName}(`);
        expect(source).not.toContain('fwidth');
    });
});
