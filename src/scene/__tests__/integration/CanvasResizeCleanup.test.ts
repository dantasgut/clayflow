/**
 * Integration test — onCanvasResized cleanup ordering.
 *
 * Valida que ForwardFlow + PostFlow destroy bindgroups + views + textures
 * antigas em ordem segura quando canvas é redimensionado, evitando
 * use-after-free na GPU (validation error "Destroyed texture used in a submit"
 * detectado pelo stress60s smoke).
 *
 * Mocka o EngineCore para capturar a sequência de destroy calls.
 */
import { describe, expect, it, vi } from 'vitest';
import { ForwardFlow } from '../../../presentation/flows/ForwardFlow';
import { PostFlow } from '../../../presentation/flows/PostFlow';
import type { EngineCore } from '../../../core/contracts/index';
import type { World } from '../../world/World';
import type { ResourceSystem } from '../../systems/ResourceSystem';

function recordingCore(): {
    core: EngineCore;
    destroyOrder: { kind: string; discriminator?: string }[];
} {
    const destroyOrder: { kind: string; discriminator?: string }[] = [];
    const core = {
        create: vi.fn(<S>(spec: S) => spec),
        createAsync: vi.fn(<S>(spec: S) => Promise.resolve(spec)),
        destroy: vi.fn((spec: { kind: string; discriminator?: string }) => {
            const entry: { kind: string; discriminator?: string } = { kind: spec.kind };
            if (spec.discriminator !== undefined) entry.discriminator = spec.discriminator;
            destroyOrder.push(entry);
        }),
        write: vi.fn(),
        writeTexture: vi.fn(),
        canvasFormat: 'rgba8unorm' as GPUTextureFormat,
        record: vi.fn(),
        submit: vi.fn(),
        memoryUsage: vi.fn(() => ({
            bufferBytes: 0,
            textureBytes: 0,
            totalBytes: 0,
            top: [],
        })),
    } as unknown as EngineCore;
    return { core, destroyOrder };
}

const fakeWorld = {} as World;
const fakeResources = {} as ResourceSystem;
const fakeCanvas = { width: 800, height: 600 } as HTMLCanvasElement;

describe('Integration — onCanvasResized cleanup', () => {
    it('ForwardFlow destrói depth + outputColor antigos no resize', () => {
        const { core, destroyOrder } = recordingCore();
        const flow = new ForwardFlow(core, fakeWorld, fakeResources, fakeCanvas);
        // Sinaliza que tinha textures via private fields setters não disponíveis →
        // reflectively setamos as referências.
        (
            flow as unknown as { depthTexture: { kind: string; discriminator: string } }
        ).depthTexture = { kind: 'texture', discriminator: 'forward_depth:800x600' };
        (flow as unknown as { depthView: { kind: string; discriminator: string } }).depthView = {
            kind: 'textureview',
            discriminator: 'forward_depthview:800x600',
        };
        (
            flow as unknown as { outputColorTexture: { kind: string; discriminator: string } }
        ).outputColorTexture = { kind: 'texture', discriminator: 'forward_color:800x600' };
        (
            flow as unknown as { outputColorView: { kind: string; discriminator: string } }
        ).outputColorView = { kind: 'textureview', discriminator: 'forward_color_view:800x600' };

        flow.onCanvasResized(1600, 1200);

        // Ordem: views primeiro, depois textures (evita view dangling).
        const kinds = destroyOrder.map((d) => d.kind);
        expect(kinds).toContain('texture');
        expect(kinds).toContain('textureview');
        expect(destroyOrder).toHaveLength(4); // 2 views + 2 textures
        // View destruído antes de sua texture-fonte:
        const depthViewIdx = destroyOrder.findIndex(
            (d) => d.discriminator === 'forward_depthview:800x600',
        );
        const depthTexIdx = destroyOrder.findIndex(
            (d) => d.discriminator === 'forward_depth:800x600',
        );
        expect(depthViewIdx).toBeLessThan(depthTexIdx);
    });

    it('PostFlow destrói bindgroups antes de views/textures (evita use-after-free)', () => {
        const { core, destroyOrder } = recordingCore();
        const flow = new PostFlow({ canvas: fakeCanvas }, core);
        // Inject bindgroups e pingpongs via reflection.
        const bgCache = (
            flow as unknown as {
                bindGroupCache: Map<string, { kind: string; discriminator: string }>;
            }
        ).bindGroupCache;
        bgCache.set('view_a|p_a', { kind: 'bindgroup', discriminator: 'post_bg:view_a|p_a' });
        bgCache.set('view_b|p_b', { kind: 'bindgroup', discriminator: 'post_bg:view_b|p_b' });
        (
            flow as unknown as { pingpongViews: { kind: string; discriminator: string }[] }
        ).pingpongViews = [
            { kind: 'textureview', discriminator: 'post_pp_a_v:800x600' },
            { kind: 'textureview', discriminator: 'post_pp_b_v:800x600' },
        ];
        (
            flow as unknown as { pingpongTextures: { kind: string; discriminator: string }[] }
        ).pingpongTextures = [
            { kind: 'texture', discriminator: 'post_pp_a:800x600' },
            { kind: 'texture', discriminator: 'post_pp_b:800x600' },
        ];

        flow.onCanvasResized(1600, 1200);

        // Ordem esperada: bindgroups → views → textures
        const kinds = destroyOrder.map((d) => d.kind);
        const firstBg = kinds.indexOf('bindgroup');
        const lastBg = kinds.lastIndexOf('bindgroup');
        const firstView = kinds.indexOf('textureview');
        const firstTex = kinds.indexOf('texture');
        expect(firstBg).toBe(0);
        expect(lastBg).toBeLessThan(firstView);
        expect(firstView).toBeLessThan(firstTex);
        expect(destroyOrder).toHaveLength(6); // 2 bg + 2 views + 2 textures
        expect(bgCache.size).toBe(0); // cache limpa
    });
});
