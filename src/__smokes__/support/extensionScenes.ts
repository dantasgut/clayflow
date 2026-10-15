// Apoio do smoke dos pontos de extensão (spec 009): leitura de pools de volta (só no smoke), espera das compilações
// assíncronas (quadros de duração 0: a cena reconcilia sem avançar o tempo), captura de pixels e as funções WGSL dos
// exemplos.
import type * as Clayflow from 'clayflow';
import type { Application, EntityId, StagingBufferSpec, StructSchema } from 'clayflow';

/** O módulo `clayflow` (os smokes importam o barril público). */
type ClayflowLib = typeof Clayflow;

/** Lê um pool inteiro de volta (bytes). */
export async function readPool(app: Application, poolKey: string): Promise<Uint8Array> {
    const spec = app.resources.poolBufferSpec(poolKey);
    if (spec === undefined) throw new Error(`pool ${poolKey} inexistente`);
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `extension_points_${poolKey}_${spec.byteSize}`,
        byteSize: spec.byteSize,
    });
    app.core.record('extension-points-readback', (frame) => {
        frame.copy(spec, staging, spec.byteSize);
    });
    app.core.submit();
    const bytes = new Uint8Array(await app.core.readback(staging));
    app.core.destroy(staging);
    return bytes;
}

/** Matriz de mundo (16 floats) de cada entidade, do pool `WorldTransform`. */
export async function readWorlds(
    app: Application,
    ids: readonly EntityId[],
): Promise<{ bytes: Uint8Array; worlds: Float32Array[] }> {
    const bytes = await readPool(app, 'WorldTransform');
    const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const stride = 112 / 4;
    const worlds = ids.map((id) => {
        const slot = app.resources.poolSlotOf('WorldTransform', id);
        if (slot === undefined) throw new Error(`entidade ${id} sem WorldTransform`);
        return all.slice(slot * stride, slot * stride + 16);
    });
    return { bytes, worlds };
}

/**
 * Deixa as compilações em segundo plano concluírem: quadros de duração 0 (sem avanço do tempo nem passos da física)
 * intercalados com espera real, até `ms`.
 */
export async function settle(app: Application, ms = 400): Promise<void> {
    const end = performance.now() + ms;
    while (performance.now() < end) {
        app.step(0);
        await new Promise((r) => setTimeout(r, 16));
    }
    app.step(0);
}

/** Pixels RGBA do canvas do app (por um canvas 2D). */
export function capture(canvas: HTMLCanvasElement): ImageData {
    const ctx = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d');
    if (ctx === null) throw new Error('canvas 2D indisponível');
    ctx.drawImage(canvas, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Órbita circular no plano xz: raio, período e fase por entidade; a altura vem do Transform. */
export const ORBIT_CODE = /* wgsl */ `
fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    let a = 6.2831853 * time / data.period + data.phase;
    var m = transform_local(t).world;
    m[3] = vec4f(data.radius * cos(a), t.position.y, data.radius * sin(a), 1.0);
    return m;
}`;

/** Espiral: o raio cresce com o tempo. */
export const SPIRAL_CODE = /* wgsl */ `
fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    let a = 6.2831853 * time / data.period + data.phase;
    let r = data.radius * (1.0 + 0.25 * time);
    var m = transform_local(t).world;
    m[3] = vec4f(r * cos(a), t.position.y + 0.1 * time, r * sin(a), 1.0);
    return m;
}`;

/**
 * Câmera olho de peixe (equidistante): vista e projeção padrão (a profundidade continua a da perspectiva) e a
 * projeção de ponto pelo ângulo ao eixo de visão — r = θ / (campo / 2).
 */
export const FISHEYE_CODE = /* wgsl */ `
fn camera_fn(c: Camera, world: mat4x4f, aspect: f32, data: CameraFnParams, time: f32) -> CameraOut {
    var out: CameraOut;
    out.view = camera_view(world);
    out.projection = camera_perspective(c.fov, aspect, c.near, c.far);
    return out;
}
fn camera_project(view_pos: vec3f, data: CameraFnParams) -> vec4f {
    let len = max(length(view_pos), 1e-6);
    let theta = acos(clamp(-view_pos.z / len, -1.0, 1.0));
    let side = length(view_pos.xy);
    let dir = select(vec2f(0.0), view_pos.xy / side, side > 1e-6);
    let r = theta / (0.5 * data.field);
    let p = camera_perspective(data.fov, data.aspect, data.near, data.far) * vec4f(view_pos, 1.0);
    let z = select(1.0, p.z / p.w, p.w > 1e-6);
    return vec4f(dir.x * r / data.aspect, dir.y * r, z, 1.0);
}`;

/** Solvers do caso dos campos (spec 009, SC-004). */
export type FieldSolver = 'lcp' | 'xpbd' | 'fem' | 'mpm-soft' | 'mpm-fluid' | 'sph' | 'pbf';

/** Corpos livres de um solver, longe de paredes, e o schema do pool que guarda `vel`. */
export function solverBodies(
    app: Application,
    solver: FieldSolver,
    lib: ClayflowLib,
): StructSchema {
    const { FluidBody, RigidBody, SoftBody } = lib;
    const spacing = lib.ParticleMaterial.defaults.particleSpacing;
    const cube = (n: number, s: number, c: readonly [number, number, number]): number[] => {
        const side = Math.round(Math.cbrt(n));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
            const x = i % side;
            const y = Math.floor(i / (side * side));
            const z = Math.floor(i / side) % side;
            out.push(
                c[0] + (x - (side - 1) / 2) * s,
                c[1] + (y - (side - 1) / 2) * s,
                c[2] + (z - (side - 1) / 2) * s,
            );
        }
        return out;
    };
    switch (solver) {
        case 'lcp':
            app.world.insert(
                new RigidBody({ shape: 'sphere', radius: 0.1, mass: 1, position: [0, 1, 0] }),
            );
            return lib.LCPSchema;
        case 'xpbd':
            app.world.insert(
                new SoftBody({
                    algorithm: 'XPBD',
                    position: [0, 1, 0, 0.1, 1, 0],
                    mass: [0.1, 0.1],
                    edges: { a: [0], b: [1], restLength: [0.1], compliance: 1e-6 },
                }),
            );
            return lib.XPBDSoftSchema;
        case 'fem':
            app.world.insert(
                new SoftBody({ algorithm: 'FEM', position: cube(27, 0.1, [0, 1, 0]), mass: 0.05 }),
            );
            return lib.FEMSchema;
        case 'mpm-soft':
            app.world.insert(
                new SoftBody({ algorithm: 'MPM', position: cube(64, spacing, [0, 0.5, 0]) }),
            );
            return lib.MPMSoftSchema;
        case 'mpm-fluid':
            app.world.insert(
                new FluidBody({ algorithm: 'MPM', position: cube(64, spacing, [0, 0.5, 0]) }),
            );
            return lib.MPMFluidSchema;
        case 'sph':
            app.world.insert(
                new FluidBody({ algorithm: 'SPH', position: cube(125, spacing, [0, 0.5, 0]) }),
            );
            return lib.SPHSchema;
        case 'pbf':
            app.world.insert(
                new FluidBody({ algorithm: 'PBF', position: cube(125, spacing, [0, 0.5, 0]) }),
            );
            return lib.PBFSchema;
    }
}

/** Média de um campo `vec4f` (xyz) de todos os elementos vivos do pool `schema`. */
export async function meanOf(
    app: Application,
    schema: StructSchema,
    field: string,
): Promise<[number, number, number]> {
    const bytes = await readPool(app, schema.name);
    const count = app.resources.poolCount(schema.name);
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const stride = schema.stride / 4;
    const at = schema.offsetOf(field) / 4;
    const sum = [0, 0, 0];
    for (let e = 0; e < count; e++) for (let k = 0; k < 3; k++) sum[k]! += f[e * stride + at + k]!;
    return [sum[0]! / count, sum[1]! / count, sum[2]! / count];
}

/** Aceleração constante (0, 0, data.a) — a função do usuário mais simples, para conferir a soma em cada solver. */
export const PUSH_CODE = /* wgsl */ `
fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    return vec3f(0.0, 0.0, data.a);
}`;

/** Atração para um anel horizontal de raio `radius` na altura `y` (mola radial e vertical de rigidez `k`). */
export const RING_CODE = /* wgsl */ `
fn field_fn(x: vec3f, v: vec3f, time: f32, body: FieldBody, data: FieldFnParams) -> vec3f {
    let d = vec3f(x.x, 0.0, x.z);
    let r = max(length(d), 1e-4);
    let radial = -d / r * (r - data.radius);
    return (radial + vec3f(0.0, data.y - x.y, 0.0)) * data.k;
}`;
