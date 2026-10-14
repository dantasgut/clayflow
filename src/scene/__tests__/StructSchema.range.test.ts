import { describe, expect, it } from 'vitest';
import { StructSchema } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';

const Particle = new StructSchema('RangeParticle', {
    pos: FieldType.vec4f,
    dir: FieldType.vec3f,
    mass: FieldType.f32,
    id: FieldType.u32,
    offset: FieldType.i32,
    frame: FieldType.mat3x3f,
});

/** Registro AoS `i` montado dos arrays SoA. */
function recordOf(soa: Record<string, number[]>, i: number): Record<string, unknown> {
    const per: Record<string, number> = { pos: 4, dir: 3, mass: 1, id: 1, offset: 1, frame: 12 };
    const out: Record<string, unknown> = {};
    for (const [name, values] of Object.entries(soa)) {
        const n = per[name]!;
        const slice = values.slice(i * n, i * n + n);
        out[name] = n === 1 ? slice[0] : slice;
    }
    return out;
}

function soaOf(count: number): Record<string, number[]> {
    const fill = (per: number, seed: number): number[] =>
        Array.from({ length: count * per }, (_, k) => seed + k * 0.5);
    return {
        pos: fill(4, 1),
        dir: fill(3, 100),
        mass: fill(1, 7),
        id: Array.from({ length: count }, (_, k) => k * 3),
        offset: Array.from({ length: count }, (_, k) => -k | 0),
        frame: fill(12, 50),
    };
}

describe('StructSchema — faixa de registros (SoA → AoS)', () => {
    it('packRange produz os mesmos bytes que pack registro a registro, com padding', () => {
        const soa = soaOf(5);
        const range = Particle.packRange(soa, 1, 3);
        expect(range.byteLength).toBe(3 * Particle.stride);
        for (let i = 0; i < 3; i++) {
            const one = Particle.pack(recordOf(soa, 1 + i));
            expect([...range.subarray(i * Particle.stride, (i + 1) * Particle.stride)]).toEqual([
                ...one,
            ]);
        }
    });

    it('aceita arrays tipados e deixa campo ausente com zero', () => {
        const pos = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const range = Particle.packRange({ pos }, 0, 2);
        const back = Particle.unpackRange(range, 2);
        expect([...(back.pos as Float32Array)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect([...(back.mass as Float32Array)]).toEqual([0, 0]);
    });

    it('unpackRange é o inverso de packRange', () => {
        const soa = soaOf(4);
        const back = Particle.unpackRange(Particle.packRange(soa, 0, 4), 4);
        for (const [name, values] of Object.entries(soa)) {
            expect(Array.from(back[name] as ArrayLike<number>)).toEqual(
                values.map((v) => Math.fround(v)),
            );
        }
    });

    it('campo com menos valores que a faixa é erro com o campo e os tamanhos', () => {
        expect(() => Particle.packRange({ pos: [1, 2, 3, 4] }, 0, 2)).toThrow(
            /'pos' tem 4 valores.*pede 8/,
        );
    });

    it('campo que não é array é erro', () => {
        expect(() => Particle.packRange({ mass: 3 }, 0, 1)).toThrow(/'mass'.*array/);
    });
});
