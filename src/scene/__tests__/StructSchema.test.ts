import { describe, expect, it } from 'vitest';
import { StructSchema } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';

describe('StructSchema layout WGSL', () => {
    it('f32 puro: stride 4 (mas align-up to 4)', () => {
        const s = new StructSchema('SingleF32', { x: FieldType.f32 });
        expect(s.stride).toBe(4);
        expect(s.offsetOf('x')).toBe(0);
    });

    it('vec3f deixa pad pra próxima vec4f', () => {
        const s = new StructSchema('Pad', { a: FieldType.vec3f, b: FieldType.vec4f });
        expect(s.offsetOf('a')).toBe(0);
        expect(s.offsetOf('b')).toBe(16);
        expect(s.stride).toBe(32);
    });

    it('vec3f + f32 cabe no mesmo slot', () => {
        const s = new StructSchema('Tight', { a: FieldType.vec3f, b: FieldType.f32 });
        expect(s.offsetOf('a')).toBe(0);
        expect(s.offsetOf('b')).toBe(12);
        expect(s.stride).toBe(16);
    });

    it('mat4x4f tem stride 64', () => {
        const s = new StructSchema('Cam', { m: FieldType.mat4x4f });
        expect(s.stride).toBe(64);
    });

    it('RigidBody legacy: 10 vec4f = 160 bytes', () => {
        const rb = new StructSchema('RigidBody', {
            pos: FieldType.vec4f, vel: FieldType.vec4f, omega: FieldType.vec4f,
            rot: FieldType.vec4f, I_inv: FieldType.vec4f, pos_pred: FieldType.vec4f,
            rot_pred: FieldType.vec4f, mat_props: FieldType.vec4f,
            body_shape: FieldType.vec4f, _rb_pad: FieldType.vec4f,
        });
        expect(rb.stride).toBe(160);
    });

    it('SoftBody/Particle: 3 vec4f = 48 bytes', () => {
        const sb = new StructSchema('SoftBody', {
            pos: FieldType.vec4f, pred: FieldType.vec4f, vel: FieldType.vec4f,
        });
        expect(sb.stride).toBe(48);
    });

    it('SPHParticle: 4 vec4f = 64 bytes', () => {
        const p = new StructSchema('SPHParticle', {
            pos: FieldType.vec4f, vel: FieldType.vec4f,
            force: FieldType.vec4f, color: FieldType.vec4f,
        });
        expect(p.stride).toBe(64);
    });

    it('MPMParticle: 8 vec4f = 128 bytes', () => {
        const p = new StructSchema('MPMParticle', {
            pos: FieldType.vec4f, vel: FieldType.vec4f,
            F_col0: FieldType.vec4f, F_col1: FieldType.vec4f, F_col2: FieldType.vec4f,
            C_col0: FieldType.vec4f, C_col1: FieldType.vec4f, C_col2: FieldType.vec4f,
        });
        expect(p.stride).toBe(128);
    });
});

describe('StructSchema.pack', () => {
    it('packs scalar único', () => {
        const s = new StructSchema('One', { x: FieldType.f32 });
        const bytes = s.pack({ x: 3.14 });
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 1);
        expect(f32[0]).toBeCloseTo(3.14, 5);
    });

    it('packs vec3f como 3 floats consecutivos', () => {
        const s = new StructSchema('V', { v: FieldType.vec3f });
        const bytes = s.pack({ v: [1, 2, 3] });
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 3);
        expect(Array.from(f32)).toEqual([1, 2, 3]);
    });

    it('packs vec4f', () => {
        const s = new StructSchema('V', { v: FieldType.vec4f });
        const bytes = s.pack({ v: [1, 2, 3, 4] });
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 4);
        expect(Array.from(f32)).toEqual([1, 2, 3, 4]);
    });

    it('respeita pad de vec3f → próximo campo', () => {
        const s = new StructSchema('P', { v: FieldType.vec3f, x: FieldType.f32 });
        const bytes = s.pack({ v: [10, 20, 30], x: 99 });
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 4);
        expect(Array.from(f32)).toEqual([10, 20, 30, 99]);
    });

    it('packs mat4x4f como 16 floats column-major', () => {
        const s = new StructSchema('M', { m: FieldType.mat4x4f });
        const m = [
            1, 2, 3, 4,
            5, 6, 7, 8,
            9, 10, 11, 12,
            13, 14, 15, 16,
        ];
        const bytes = s.pack({ m });
        const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, 16);
        expect(Array.from(f32)).toEqual(m);
    });

    it('packs u32', () => {
        const s = new StructSchema('U', { n: FieldType.u32 });
        const bytes = s.pack({ n: 42 });
        const u32 = new Uint32Array(bytes.buffer, bytes.byteOffset, 1);
        expect(u32[0]).toBe(42);
    });

    it('applyDefaults zera campos faltantes', () => {
        const s = new StructSchema('D', { a: FieldType.f32, b: FieldType.vec3f });
        const data = s.applyDefaults({});
        expect(data['a']).toBe(0);
        expect(data['b']).toEqual([0, 0, 0]);
    });

    it('applyDefaults preserva campos providos', () => {
        const s = new StructSchema('D', { a: FieldType.f32, b: FieldType.f32 });
        const data = s.applyDefaults({ a: 5 });
        expect(data['a']).toBe(5);
        expect(data['b']).toBe(0);
    });
});

describe('StructSchema.toWGSL', () => {
    it('gera struct WGSL válido', () => {
        const s = new StructSchema('Camera', {
            view: FieldType.mat4x4f,
            near: FieldType.f32,
        });
        const wgsl = s.toWGSL();
        expect(wgsl).toContain('struct Camera');
        expect(wgsl).toContain('view: mat4x4<f32>');
        expect(wgsl).toContain('near: f32');
    });
});
