/**
 * Integração — redimensionamento do canvas sem uso de objeto destruído.
 *
 * No `canvasReconfigured` a C2 recria as texturas `sizeFromCanvas` (os `FrameTargets` do render principal) e o
 * `PostFlow` recria o pingue-pongue; os bind groups que as usavam são substituídos antes da próxima gravação. O
 * quadro seguinte não pode referenciar nenhum objeto destruído (o erro de validação "Destroyed texture used in a
 * submit" visto no smoke stress60s).
 */
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { Vignette } from '../../../presentation/flows/effects/Vignette';
import {
    discOf,
    registerStages,
    renderScene,
    type RenderPassRecord,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

/** Todo spec referenciado pelos passes gravados: alvos e recursos dos bind groups ligados. */
function referenced(passes: readonly RenderPassRecord[]): unknown[] {
    const out: unknown[] = [];
    for (const pass of passes) {
        for (const c of pass.target.colorAttachments) out.push(c.view);
        if (pass.target.depthStencilAttachment !== undefined)
            out.push(pass.target.depthStencilAttachment.view);
        for (const draw of pass.draws) {
            for (const { group } of draw.bindGroups.values()) {
                out.push(group);
                for (const b of group.bindings) {
                    const r = b as { buffer?: unknown; view?: unknown; resource?: unknown };
                    out.push(r.buffer ?? r.view ?? r.resource);
                }
            }
        }
    }
    return out.filter((r) => r !== undefined);
}

async function scene() {
    const s = await renderScene();
    const { post, frameTargets } = registerStages(s.scene, { forward: 'scene', post: true });
    post!.addEffect(new Vignette());
    s.scene.world.insert(new Camera());
    s.scene.world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
    const targets = frameTargets!;
    const resize = (width: number, height: number): void => {
        vi.mocked(s.core.canvasSize).mockReturnValue({ width, height });
        s.scene.events.emit('canvasReconfigured', { width, height, format: s.core.canvasFormat });
    };
    return { ...s, targets, resize };
}

describe('Integração — redimensionamento do canvas', () => {
    it('recria os FrameTargets e o pingue-pongue no novo tamanho e destrói os antigos', async () => {
        const s = await scene();
        s.step();
        const oldColor = s.scene.resourceSystem.textureOf(s.targets, 'color')!;
        const oldDepth = s.scene.resourceSystem.textureOf(s.targets, 'depth')!;
        s.resetCounts();
        s.resize(1600, 1200);
        s.step();
        const color = s.scene.resourceSystem.textureOf(s.targets, 'color')!;
        expect(color).not.toBe(oldColor);
        expect([color.width, color.height]).toEqual([1600, 1200]);
        expect(s.destroys()).toEqual(expect.arrayContaining([oldColor, oldDepth]));
        const pingpong = s.creates().filter((c) => discOf(c).startsWith('post_pp_'));
        expect(pingpong.length).toBeGreaterThan(0);
        expect(pingpong.every((c) => discOf(c).endsWith(':1600x1200'))).toBe(true);
        expect(
            s
                .destroys()
                .some((d) => discOf(d).endsWith(':800x600') && discOf(d).startsWith('post_pp_')),
        ).toBe(true);
    });

    it('o quadro seguinte ao redimensionamento não referencia objeto destruído', async () => {
        const s = await scene();
        s.step();
        s.resetCounts();
        s.resize(1600, 1200);
        const passes = s.step();
        expect(passes.map((p) => p.label)).toEqual(['ForwardFlow', 'PostFlow.Vignette']);
        const destroyed = new Set<unknown>(s.destroys());
        expect(referenced(passes).filter((r) => destroyed.has(r))).toEqual([]);
    });

    it('redimensionar no mesmo quadro em que o pool WorldTransform cresce: os dois tratados, nada destruído referenciado', async () => {
        const s = await scene();
        s.step();
        const before = s.scene.resourceSystem.poolBufferSpec('WorldTransform');
        s.resetCounts();
        s.resize(1024, 768);
        for (let i = 0; i < 300; i++) {
            s.scene.world.insert(
                new BoxGeometry().add(new StandardMaterial()).add(new Transform()),
            );
        }
        const passes = s.step();
        expect(s.scene.resourceSystem.poolBufferSpec('WorldTransform')).not.toBe(before);
        expect(s.scene.resourceSystem.textureOf(s.targets, 'color')!.width).toBe(1024);
        expect(s.draws('ForwardFlow')).toHaveLength(301);
        const destroyed = new Set<unknown>(s.destroys());
        expect(referenced(passes).filter((r) => destroyed.has(r))).toEqual([]);
    });
});
