import { describe, expect, it } from 'vitest';
import { LayoutInferencer } from '../systems/LayoutInferencer';

describe('LayoutInferencer.parseWGSL', () => {
    const inf = new LayoutInferencer();

    it('parsea binding storage rw em compute simples', () => {
        const src = `
@group(0) @binding(0) var<storage, read_write> bodies: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    bodies[gid.x] = 1.0;
}`;
        const info = inf.parseWGSL(src);
        expect(info.bindings).toHaveLength(1);
        expect(info.bindings[0]?.name).toBe('bodies');
        expect(info.bindings[0]?.group).toBe(0);
        expect(info.bindings[0]?.binding).toBe(0);
        expect(info.bindings[0]?.stages.has('compute')).toBe(true);
    });

    it('detecta múltiplos groups', () => {
        const src = `
@group(0) @binding(0) var<uniform> camera: f32;
@group(1) @binding(0) var<uniform> light: f32;
@group(2) @binding(0) var<storage, read> particles: array<f32>;
@compute @workgroup_size(64)
fn main() {
    let _x = camera + light + particles[0];
}`;
        const info = inf.parseWGSL(src);
        expect(info.bindings).toHaveLength(3);
        const groups = info.bindings.map(b => b.group).sort();
        expect(groups).toEqual([0, 1, 2]);
    });

    it('@workgroup_size entre @compute e fn não bloqueia detecção de stage', () => {
        const src = `
@group(0) @binding(0) var<storage, read_write> data: array<u32>;
@compute @workgroup_size(64)
fn cs_main() { data[0] = 1u; }`;
        const info = inf.parseWGSL(src);
        expect(info.bindings[0]?.stages.has('compute')).toBe(true);
    });

    it('vertex + fragment multi-stage detectado', () => {
        const src = `
@group(0) @binding(0) var<uniform> camera: f32;
struct VsOut { @builtin(position) pos: vec4<f32>, @location(0) c: vec3<f32> }
@vertex fn vs_main() -> VsOut { var o: VsOut; o.pos = vec4<f32>(camera); return o; }
@fragment fn fs_main(in: VsOut) -> @location(0) vec4<f32> { return vec4<f32>(camera); }`;
        const info = inf.parseWGSL(src);
        expect(info.bindings[0]?.stages.has('vertex')).toBe(true);
        expect(info.bindings[0]?.stages.has('fragment')).toBe(true);
    });

    it('binding usado só em fragment não aparece no vertex', () => {
        const src = `
@group(0) @binding(0) var<uniform> mat: f32;
struct VsOut { @builtin(position) pos: vec4<f32> }
@vertex fn vs_main() -> VsOut { var o: VsOut; o.pos = vec4<f32>(0); return o; }
@fragment fn fs_main(in: VsOut) -> @location(0) vec4<f32> { return vec4<f32>(mat); }`;
        const info = inf.parseWGSL(src);
        expect(info.bindings[0]?.stages.has('fragment')).toBe(true);
        expect(info.bindings[0]?.stages.has('vertex')).toBe(false);
    });

    it('shader sem bindings retorna lista vazia', () => {
        const info = inf.parseWGSL(`
@compute @workgroup_size(1) fn main() {}`);
        expect(info.bindings).toHaveLength(0);
    });
});

describe('LayoutInferencer.inferUsageFromRole', () => {
    const inf = new LayoutInferencer();

    it('uniform → UNIFORM | COPY_DST', () => {
        const u = inf.inferUsageFromRole('uniform');
        expect(u & GPUBufferUsage.UNIFORM).toBeTruthy();
        expect(u & GPUBufferUsage.COPY_DST).toBeTruthy();
    });

    it('storage-rw → STORAGE | COPY_SRC | COPY_DST', () => {
        const u = inf.inferUsageFromRole('storage-rw');
        expect(u & GPUBufferUsage.STORAGE).toBeTruthy();
        expect(u & GPUBufferUsage.COPY_SRC).toBeTruthy();
    });

    it('vertex inclui VERTEX e STORAGE', () => {
        const u = inf.inferUsageFromRole('vertex');
        expect(u & GPUBufferUsage.VERTEX).toBeTruthy();
        expect(u & GPUBufferUsage.STORAGE).toBeTruthy();
    });

    it('staging → COPY_DST | MAP_READ', () => {
        const u = inf.inferUsageFromRole('staging');
        expect(u & GPUBufferUsage.COPY_DST).toBeTruthy();
        expect(u & GPUBufferUsage.MAP_READ).toBeTruthy();
    });
});
