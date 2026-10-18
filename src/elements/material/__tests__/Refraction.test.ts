import { describe, expect, it } from 'vitest';
import { Refraction } from '../Refraction';

describe('Refraction (spec 034)', () => {
    it('padrão: 6 interfaces e o desfoque da rugosidade; um uniform', () => {
        const r = new Refraction();
        expect(r.data).toEqual({ maxInterfaces: 6, roughnessBlur: 1 });
        expect(r.getDescriptors()).toEqual([
            { id: 'params', role: 'uniform', schema: Refraction.schema },
        ]);
        expect(r.getPipelineDescriptors()).toEqual([]);
    });

    it('autoria: interfaces e desfoque; fora do intervalo rejeita', () => {
        expect(new Refraction({ maxInterfaces: 2, roughnessBlur: false }).data).toEqual({
            maxInterfaces: 2,
            roughnessBlur: 0,
        });
        expect(() => new Refraction({ maxInterfaces: 0 })).toThrow(RangeError);
        expect(() => new Refraction({ maxInterfaces: 1.5 })).toThrow(RangeError);
        expect(() => new Refraction({ maxInterfaces: 33 })).toThrow(RangeError);
    });
});
