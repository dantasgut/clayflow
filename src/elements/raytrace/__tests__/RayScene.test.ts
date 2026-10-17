import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { SphereGeometry } from '../../geometry/SphereGeometry';
import { StandardMaterial } from '../../material/StandardMaterial';
import { Transform } from '../../scene/Transform';
import { renderScene } from '../../../presentation/flows/__tests__/helpers/renderHarness';
import { RayScene } from '../RayScene';
import { RaySceneFlow } from '../RaySceneFlow';

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
    it('descritores: o uniform da estrutura e os seis pools escritos só pela GPU, com a capacidade como contagem', () => {
        const scene = new RayScene();
        const byId = new Map(scene.getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('info')).toMatchObject({ role: 'uniform' });
        for (const id of ['vertices', 'triangles', 'spheres', 'nodes', 'blas', 'instances']) {
            expect(byId.get(id)).toMatchObject({
                storage: 'pool',
                upload: 'never',
                role: 'storage-rw',
            });
        }
        expect(byId.get('nodes')?.count).toBe(scene.data.nodes);
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
});
