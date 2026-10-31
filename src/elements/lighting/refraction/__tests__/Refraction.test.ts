import { describe, expect, it, vi } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import { SetCountSchema } from '../../../../scene/graph/SetCountSchema';
import {
    Refraction,
    REFRACTION_DEFAULT_INTERFACES,
    REFRACTION_FRAME_COUNT,
    REFRACTION_MAX_MEDIA,
    REFRACTION_MAX_INTERFACES,
} from '../Refraction';

// Refração traçada (spec 034, T040): valores e validação, e os alvos do tamanho do canvas alocados só sob demanda.

const TARGETS = [
    // A transmitida mais a refletida na primeira interface (no alfa, a energia truncada).
    ['radiance', 'rgba16float'],
    // O ponto que o pixel mostra e o registro do objeto (T044a).
    ['hit', 'rgba32float'],
    // O albedo do ponto mostrado (o guia de textura do filtro) e, no alfa, a marca de movimento.
    ['albedo', 'rgba16float'],
    // A marca de movimento do quadro anterior (T044a).
    ['gradient', 'rgba16float'],
    ['queue', 'r32uint'],
] as const;

describe('Refraction (spec 034, T040)', () => {
    it('padrão: ligada, 16 interfaces; validação de 1–32 (o valor anterior fica)', () => {
        const r = new Refraction();
        expect(r.data).toEqual({
            enabled: 1,
            max_interfaces: 16,
            camera_slot: 0,
            light_count: 0,
            frame: 0,
            time: 0,
            checkerboard: 0,
            _pad1: 0,
        });
        expect([r.enabled, r.maxInterfaces]).toEqual([true, REFRACTION_DEFAULT_INTERFACES]);
        expect(new Refraction({ enabled: false, maxInterfaces: 32 }).data).toMatchObject({
            enabled: 0,
            max_interfaces: REFRACTION_MAX_INTERFACES,
        });
        for (const n of [0, 33, 2.5, Number.NaN])
            expect(() => new Refraction({ maxInterfaces: n })).toThrow(RangeError);
        r.maxInterfaces = 8;
        expect(() => {
            r.maxInterfaces = 40;
        }).toThrow(RangeError);
        expect(r.maxInterfaces).toBe(8);
        r.enabled = false;
        expect(r.data.enabled).toBe(0);
    });

    it('descritores: parâmetros; pedido (alvo de render) e a profundidade dele, radiâncias, ponto mostrado e fila (storage) do tamanho do canvas; contagem indireta e estado do quadro — tudo sob demanda menos os parâmetros', () => {
        const byId = new Map(new Refraction().getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('params')).toEqual({
            id: 'params',
            role: 'uniform',
            schema: Refraction.schema,
        });
        for (const [id, format] of TARGETS)
            expect(byId.get(id)).toEqual({
                id,
                role: 'storage-texture',
                allocation: 'onDemand',
                textureShape: { format, sizeFromCanvas: true, access: 'write-only' },
            });
        expect(byId.get('request')).toEqual({
            id: 'request',
            role: 'texture',
            allocation: 'onDemand',
            textureShape: { format: 'rg32uint', sizeFromCanvas: true },
        });
        expect(byId.get('requestDepth')).toEqual({
            id: 'requestDepth',
            role: 'texture',
            allocation: 'onDemand',
            textureShape: { format: 'depth24plus', sizeFromCanvas: true },
        });
        expect(byId.get('queueCount')).toMatchObject({
            role: 'indirect',
            schema: SetCountSchema,
            count: 1,
            upload: 'never',
            allocation: 'onDemand',
        });
        // Dois texels por meio da câmera e a contagem da fila no último.
        expect(REFRACTION_FRAME_COUNT.value).toBe(2 * REFRACTION_MAX_MEDIA.value);
        expect(byId.get('frame')).toEqual({
            id: 'frame',
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: {
                format: 'rgba32uint',
                width: REFRACTION_FRAME_COUNT.value + 1,
                height: 1,
                access: 'write-only',
            },
        });
        expect(byId.size).toBe(10);
    });

    it('a C2 aloca só os parâmetros na inserção; os alvos quando pedidos, no tamanho do canvas, e recriados quando ele muda', async () => {
        const s = await renderScene();
        const r = new Refraction();
        s.scene.world.insert(r);
        s.step();
        const rs = s.scene.resourceSystem;
        expect(rs.bufferOf(r, 'params')).toBeDefined();
        for (const id of [...TARGETS.map(([t]) => t), 'request', 'requestDepth'])
            expect(rs.textureOf(r, id)).toBeUndefined();
        expect(rs.bufferOf(r, 'queueCount')).toBeUndefined();
        expect(rs.textureOf(r, 'frame')).toBeUndefined();

        for (const [id] of TARGETS) rs.ensureAllocated(r, id);
        rs.ensureAllocated(r, 'request');
        const request = rs.textureOf(r, 'request')!;
        // O pedido é alvo de render do desenho e lido como textura pela fila.
        expect([request.width, request.height, request.format]).toEqual([800, 600, 'rg32uint']);
        expect(request.usage & GPUTextureUsage.RENDER_ATTACHMENT).toBeTruthy();
        expect(request.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
        const count = rs.ensureAllocated(r, 'queueCount')!;
        rs.ensureAllocated(r, 'frame');
        const frame = rs.textureOf(r, 'frame')!;
        for (const [id, format] of TARGETS) {
            const t = rs.textureOf(r, id)!;
            expect([t.width, t.height, t.format]).toEqual([800, 600, format]);
            // Escrita como storage, lida pelos consumidores como textura.
            expect(t.usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
            expect(t.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
        }
        expect([count.subkind, count.byteSize]).toEqual(['indirect', SetCountSchema.stride]);
        expect([frame.width, frame.height, frame.format]).toEqual([
            REFRACTION_FRAME_COUNT.value + 1,
            1,
            'rgba32uint',
        ]);
        expect(frame.usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
        expect(frame.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();

        const old = TARGETS.map(([id]) => rs.textureOf(r, id)!);
        vi.mocked(s.core.canvasSize).mockReturnValue({ width: 320, height: 200 });
        s.scene.events.emit('canvasReconfigured', {
            width: 320,
            height: 200,
            format: s.core.canvasFormat,
        });
        expect(
            TARGETS.map(([id]) => [rs.textureOf(r, id)!.width, rs.textureOf(r, id)!.height]),
        ).toEqual(TARGETS.map(() => [320, 200]));
        // O estado do quadro tem tamanho fixo: não acompanha o canvas.
        expect(rs.textureOf(r, 'frame')).toBe(frame);
        expect(s.destroys()).toEqual(expect.arrayContaining(old));
    });
});
