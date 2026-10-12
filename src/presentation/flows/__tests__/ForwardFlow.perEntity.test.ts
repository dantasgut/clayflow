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
    const camera = new Camera();
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
        // A geometria de cada entidade é dela (VBO/IBO alocados pela C2 a partir dos descritores); o resto — pools
        // que crescem e os bind groups religados — não escala com o número de entidades.
        const others = s.creates().filter((c) => {
            const sub = (c as { subkind?: string }).subkind;
            return !(c.kind === 'buffer' && (sub === 'vertex' || sub === 'index'));
        });
        expect(others.length).toBeLessThan(100);
        expect(others.filter((c) => /^(forward|shadow)_/.test(discOf(c)))).toEqual([]);
        expect(s.createdWhileRecording()).toBe(0);
        expect(s.draws('ForwardFlow')).toHaveLength(10_010);
        expect(s.draws('ShadowFlow')).toHaveLength(10_010);
    });

    it('SC-002: a câmera é escrita uma vez no quadro em que muda e nenhuma nos outros', async () => {
        const s = await scene();
        s.add(100);
        s.step();
        const cameraBuffer = s.scene.resourceSystem.bufferOf(s.camera, 'camera');
        expect(cameraBuffer).toBeDefined();
        s.resetCounts();
        s.step();
        expect(s.writes().filter((w) => w === cameraBuffer)).toHaveLength(0);
        (s.camera.data.position as number[])[0] = 3;
        s.step();
        expect(s.writes().filter((w) => w === cameraBuffer)).toHaveLength(1);
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

    it('grupos 0, 1 e 3 uma vez por passe; grupo 2 só quando o material (pool ou offset) muda', async () => {
        const s = await scene();
        s.add(20);
        for (let i = 0; i < 5; i++) {
            s.scene.world.insert(
                new BoxGeometry().add(new WireframeMaterial()).add(new Transform()),
            );
        }
        const [pass] = s.step().filter((p) => p.label === 'ForwardFlow');
        const count = (g: number) => pass!.setBindGroups.filter((i) => i === g).length;
        expect(count(0)).toBe(1);
        expect(count(1)).toBe(1);
        expect(count(3)).toBe(1);
        expect(pass!.draws).toHaveLength(25);
        // Cada entidade tem o seu slot no pool do material ⇒ um offset novo por desenho, alinhado a 256.
        const offsets = pass!.draws.map((d) => d.bindGroups.get(2)!.offsets![0]);
        expect(count(2)).toBe(25);
        for (const d of pass!.draws) expect(d.bindGroups.get(2)!.offsets).toHaveLength(1);
        expect(new Set(offsets.map((o) => o! % 256))).toEqual(new Set([0]));
    });

    it('sem câmera o forward não fica pronto e não grava', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene' });
        s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        expect(s.step().filter((p) => p.label === 'ForwardFlow')).toEqual([]);
        s.scene.world.insert(new Camera());
        expect(s.step().filter((p) => p.label === 'ForwardFlow')).toHaveLength(1);
    });

    it('entidade sem Material não gera desenho nem aviso repetido', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene' });
        s.scene.world.insert(new Camera());
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        for (let i = 0; i < 5; i++) s.step();
        expect(s.draws('ForwardFlow')).toEqual([]);
        expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    });
});
