import { afterEach, describe, expect, it, vi } from 'vitest';
import { Transform } from '../Transform';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Transform', () => {
    it('schema de intenção tem só posição, rotação e escala (stride 48)', () => {
        expect([...Transform.schema.fields.keys()]).toEqual(['position', 'rotation', 'scale']);
        expect(Transform.schema.stride).toBe(48);
    });

    it('worldSchema descreve o produto do estágio (stride 112)', () => {
        expect(Transform.worldSchema.name).toBe('WorldTransform');
        expect([...Transform.worldSchema.fields.keys()]).toEqual(['world', 'normal']);
        expect(Transform.worldSchema.stride).toBe(112);
    });

    it('declara intenção (always) e matriz de mundo (never) em pools', () => {
        const [intent, world] = new Transform().getDescriptors();
        expect(intent).toMatchObject({
            id: 'transform',
            role: 'storage-ro',
            storage: 'pool',
            schema: Transform.schema,
            upload: 'always',
        });
        expect(world).toMatchObject({
            id: 'world',
            role: 'storage-rw',
            storage: 'pool',
            schema: Transform.worldSchema,
            upload: 'never',
        });
    });

    it('aplica defaults de posição, rotação e escala', () => {
        const t = new Transform();
        expect(t.data).toEqual({
            position: [0, 0, 0, 1],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1, 1],
        });
    });

    it('construtor com model avisa uma vez por execução e não guarda model', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        Transform.resetLegacyModelWarning();
        const a = new Transform({ position: [1, 2, 3, 1], model: new Array(16).fill(0) } as never);
        new Transform({ model: new Array(16).fill(0) } as never);
        expect(warn).toHaveBeenCalledTimes(1);
        expect('model' in a.data).toBe(false);
        expect(a.data.position).toEqual([1, 2, 3, 1]);
    });
});
