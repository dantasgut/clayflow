import { describe, expect, it, vi } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import { SetCountSchema } from '../../../../scene/graph/SetCountSchema';
import {
    Refraction,
    RefractionStatsSchema,
    REFRACTION_DEFAULT_INTERFACES,
    REFRACTION_MAX_INTERFACES,
} from '../Refraction';

// Refração traçada (spec 034, T040): valores e validação, e os alvos do tamanho do canvas alocados só sob demanda.

const TARGETS = [
    ['request', 'rgba32uint'],
    ['radiance', 'rgba16float'],
    ['reflection', 'rgba16float'],
    ['queue', 'r32uint'],
] as const;

describe('Refraction (spec 034, T040)', () => {
    it('padrão: ligada, 16 interfaces; validação de 1–32 (o valor anterior fica)', () => {
        const r = new Refraction();
        expect(r.data).toEqual({ enabled: 1, max_interfaces: 16, _pad0: 0, _pad1: 0 });
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

    it('descritores: parâmetros; pedido, radiâncias e fila do tamanho do canvas; contagem indireta e contadores — tudo sob demanda menos os parâmetros', () => {
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
        expect(byId.get('queueCount')).toMatchObject({
            role: 'indirect',
            schema: SetCountSchema,
            count: 1,
            upload: 'never',
            allocation: 'onDemand',
        });
        expect(byId.get('stats')).toMatchObject({
            role: 'storage-rw',
            schema: RefractionStatsSchema,
            count: 1,
            upload: 'never',
            allocation: 'onDemand',
        });
        expect(byId.size).toBe(7);
    });

    it('a C2 aloca só os parâmetros na inserção; os alvos quando pedidos, no tamanho do canvas, e recriados quando ele muda', async () => {
        const s = await renderScene();
        const r = new Refraction();
        s.scene.world.insert(r);
        s.step();
        const rs = s.scene.resourceSystem;
        expect(rs.bufferOf(r, 'params')).toBeDefined();
        for (const [id] of TARGETS) expect(rs.textureOf(r, id)).toBeUndefined();
        expect(rs.bufferOf(r, 'queueCount')).toBeUndefined();
        expect(rs.bufferOf(r, 'stats')).toBeUndefined();

        for (const [id] of TARGETS) rs.ensureAllocated(r, id);
        const count = rs.ensureAllocated(r, 'queueCount')!;
        const stats = rs.ensureAllocated(r, 'stats')!;
        for (const [id, format] of TARGETS) {
            const t = rs.textureOf(r, id)!;
            expect([t.width, t.height, t.format]).toEqual([800, 600, format]);
            // Escrita como storage, lida pelos consumidores como textura.
            expect(t.usage & GPUTextureUsage.STORAGE_BINDING).toBeTruthy();
            expect(t.usage & GPUTextureUsage.TEXTURE_BINDING).toBeTruthy();
        }
        expect([count.subkind, count.byteSize]).toEqual(['indirect', SetCountSchema.stride]);
        expect([stats.subkind, stats.byteSize]).toEqual(['storage', 16]);

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
        expect(s.destroys()).toEqual(expect.arrayContaining(old));
    });
});
