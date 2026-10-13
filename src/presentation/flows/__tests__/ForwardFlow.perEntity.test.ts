/**
 * Critérios de custo por entidade do render (SC-001, SC-002): os estágios não criam objeto de GPU por entidade, a
 * câmera é escrita uma vez por quadro (só quando muda) e os grupos compartilhados são definidos uma vez por passe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { WireframeMaterial } from '../../../elements/material/WireframeMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

async function scene() {
    const s = await renderScene();
    registerStages(s.scene, { shadow: true, forward: 'scene' });
    const camera = new Camera().add(new Transform({ position: [0, 0, 5, 1] }));
    s.scene.world.insert(camera);
    s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
    const add = (n: number): void => {
        for (let i = 0; i < n; i++) {
            s.scene.world.insert(
                new BoxGeometry()
                    .add(new StandardMaterial())
                    .add(new Transform({ position: [i, 0, 0, 1] })),
            );
        }
    };
    return { ...s, camera, add };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ForwardFlow/ShadowFlow — custo por entidade', () => {
    it('SC-001: 10 mil entidades não criam objeto de GPU por entidade nos estágios', async () => {
        const s = await scene();
        s.add(10);
        s.step();
        s.resetCounts();
        s.add(10_000);
        s.step();
        // Nada escala com o número de entidades: a geometria é uma cópia por conteúdo (spec 007), e o resto — pools
        // que crescem e os bind groups religados — é por pool.
        expect(s.creates().length).toBeLessThan(100);
        expect(s.creates().filter((c) => /^(forward|shadow)_/.test(discOf(c)))).toEqual([]);
        expect(s.createdWhileRecording()).toBe(0);
        // Um desenho por grupo (mesma caixa, mesmo material, mesma orientação) com as 10 010 instâncias.
        expect(s.draws('ForwardFlow').map((d) => d.instanceCount)).toEqual([10_010]);
        expect(s.draws('ShadowFlow').map((d) => d.instanceCount)).toEqual([10_010]);
    });

    it('SC-002: nenhuma matriz de câmera vem da CPU; parâmetros escritos só quando mudam (spec 007)', async () => {
        const s = await scene();
        s.add(100);
        s.step();
        const pool = (key: string) => s.scene.resourceSystem.poolBufferSpec(key);
        s.resetCounts();
        s.step();
        expect(s.writes().filter((w) => w === pool('Camera'))).toHaveLength(0);
        expect(s.writes().filter((w) => w === pool('CameraMatrices'))).toHaveLength(0);
        s.camera.data.fov = Math.PI / 3;
        s.step();
        expect(s.writes().filter((w) => w === pool('Camera'))).toHaveLength(1);
        expect(s.writes().filter((w) => w === pool('CameraMatrices'))).toHaveLength(0);
    });

    it('nenhuma criação nem escrita em quadros estáveis além do relógio', async () => {
        const s = await scene();
        s.add(50);
        s.step();
        s.resetCounts();
        s.step();
        s.step();
        expect(s.creates()).toEqual([]);
        // Só o relógio da cena (`Time`), que avança todo quadro.
        const time = s.scene.resourceSystem.bufferOf(s.scene.time, 'time');
        expect(
            s
                .writes()
                .filter((w) => w !== time)
                .map(discOf),
        ).toEqual([]);
    });

    it('grupos 0, 1 e 3 uma vez por passe; grupo 2 só quando o pipeline muda; um desenho por grupo de instâncias', async () => {
        const s = await scene();
        s.add(20);
        const ids: number[] = [];
        for (let i = 0; i < 5; i++) {
            ids.push(
                s.scene.world.insert(
                    new BoxGeometry().add(new WireframeMaterial()).add(new Transform()),
                ),
            );
        }
        const [pass] = s.step().filter((p) => p.label === 'ForwardFlow');
        const count = (g: number) => pass!.setBindGroups.filter((i) => i === g).length;
        expect(count(0)).toBe(1);
        expect(count(1)).toBe(1);
        expect(count(3)).toBe(1);
        // Dois grupos (mesma caixa; shaders standard e wireframe) ⇒ dois desenhos, com 20 e 5 instâncias.
        expect(pass!.draws.map((d) => d.instanceCount)).toEqual([20, 5]);
        // Dois pipelines ⇒ dois binds do material, sem offset dinâmico.
        expect(count(2)).toBe(2);
        for (const d of pass!.draws) expect(d.bindGroups.get(2)!.offsets ?? []).toHaveLength(0);
        // Os segmentos dos grupos na lista de instâncias não se sobrepõem.
        const [a, b] = pass!.draws;
        expect(
            a!.firstInstance! + 20 <= b!.firstInstance!
                || b!.firstInstance! + 5 <= a!.firstInstance!,
        ).toBe(true);
        expect(ids).toHaveLength(5);
    });

    it('SC-010: com 10 mil entidades, os binds do passe dependem só dos pipelines (nenhum por entidade)', async () => {
        const s = await scene();
        s.add(10_000);
        const [pass] = s.step().filter((p) => p.label === 'ForwardFlow');
        expect(pass!.draws.map((d) => d.instanceCount)).toEqual([10_000]);
        // Grupos 0, 1, 3 uma vez; grupo 2 uma vez por pipeline (um só: StandardMaterial, faces diretas).
        expect(pass!.setBindGroups).toHaveLength(4);
    });

    it('sem câmera o forward não fica pronto e não grava', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene' });
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        expect(s.step().filter((p) => p.label === 'ForwardFlow')).toEqual([]);
        s.scene.world.insert(new Camera().add(new Transform()));
        expect(s.step().filter((p) => p.label === 'ForwardFlow')).toHaveLength(1);
    });

    it('entidade sem Material não gera desenho nem aviso repetido', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene' });
        s.scene.world.insert(new Camera().add(new Transform()));
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        for (let i = 0; i < 5; i++) s.step();
        expect(s.draws('ForwardFlow')).toEqual([]);
        expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    });
});
