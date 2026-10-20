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
 * Espera o motor pronto (spec 034): nenhum pipeline sem fonte, em conferência, compilando ou trocando — quadros de
 * duração 0 (sem avanço do tempo nem passos da física) até a prontidão. `ms` é o mínimo de espera real, para os
 * smokes que acumulam luz ou deixam a página respirar; o prazo da prontidão é de 60 s.
 */
export async function settle(app: Application, ms = 0): Promise<void> {
    const end = performance.now() + ms;
    await app.whenReady({ timeoutMs: 60_000 });
    while (performance.now() < end) {
        app.step(0);
        await new Promise((r) => setTimeout(r, 16));
    }
    // Um quadro na mesma tarefa de quem chamou: o canvas WebGPU só vale até a tarefa ceder (captura logo depois).
    app.step(0);
}

/**
 * Espera a GPU ter espaço para mais um quadro (`readyForFrame`, o mesmo ritmo do laço e do bench): medir com a CPU
 * gravando à frente da GPU enche a fila e deixa os quadros sem leitura de tempo (spec 034, H1).
 */
export async function nextGpuFrame(app: Application): Promise<void> {
    do await new Promise((r) => requestAnimationFrame(r));
    while (!app.readyForFrame());
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

/** Emissor em espiral: a partícula i nasce em (r·cos 0,1i, 0,01i, r·sin 0,1i), parada, com vida longa. */
export const SPIRAL_EMIT_CODE = /* wgsl */ `
fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle {
    let a = f32(i) * 0.1;
    var p: EmittedParticle;
    p.position = vec3f(data.radius * cos(a), f32(i) * 0.01, data.radius * sin(a));
    p.velocity = vec3f(0.0);
    p.life = 100.0;
    p.color = vec4f(0.2, 0.6, 1.0, 1.0);
    return p;
}`;

/** Lê um buffer de GPU inteiro de volta (bytes) — vértices escritos por um estágio, partículas de um emissor. */
export async function readBuffer(
    app: Application,
    spec: { readonly byteSize: number },
    label: string,
): Promise<Float32Array> {
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `extension_points_${label}_${spec.byteSize}`,
        byteSize: spec.byteSize,
    });
    app.core.record('extension-points-buffer', (frame) => {
        frame.copy(spec as Parameters<typeof frame.copy>[0], staging, spec.byteSize);
    });
    app.core.submit();
    const out = new Float32Array(await app.core.readback(staging));
    app.core.destroy(staging);
    return out;
}

/** Esfera de raio `data.r` com as derivadas analíticas. */
export const SPHERE_ANALYTIC_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return data.r * vec3f(sin(v) * cos(u), cos(v), sin(v) * sin(u));
}
fn surface_du(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return data.r * vec3f(-sin(v) * sin(u), 0.0, sin(v) * cos(u));
}
fn surface_dv(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return data.r * vec3f(cos(v) * cos(u), -sin(v), cos(v) * sin(u));
}`;

/** Homotopia esfera ↔ toro: s = 0,5 + 0,5 · sen(time) mistura as duas (u ∈ [0, 2π], v ∈ [0, π]). */
export const HOMOTOPY_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let s = 0.5 + 0.5 * sin(time * data.speed);
    let sphere = vec3f(sin(v) * cos(u), cos(v), sin(v) * sin(u));
    let w = 2.0 * v;
    let ring = 1.0 + 0.35 * cos(w);
    let torus = vec3f(ring * cos(u), -0.35 * sin(w), ring * sin(u));
    return mix(sphere, torus, s);
}`;

/** Torção em torno de y: ângulo k · y. */
export const TWIST_CODE = /* wgsl */ `
fn space_fn(x: vec3f, time: f32, data: SpaceFnParams) -> vec3f {
    let a = data.k * x.y;
    return vec3f(x.x * cos(a) - x.z * sin(a), x.y, x.x * sin(a) + x.z * cos(a));
}`;

/** A mesma torção com a Jacobiana analítica. */
export const TWIST_JACOBIAN_CODE = /* wgsl */ `${TWIST_CODE}
fn space_jacobian(x: vec3f, time: f32, data: SpaceFnParams) -> mat3x3f {
    let a = data.k * x.y;
    let c = cos(a);
    let s = sin(a);
    // Colunas: ∂/∂x, ∂/∂y, ∂/∂z.
    return mat3x3f(
        vec3f(c, 0.0, s),
        vec3f(data.k * (-x.x * s - x.z * c), 1.0, data.k * (x.x * c - x.z * s)),
        vec3f(-s, 0.0, c),
    );
}`;

/** Xadrez de 8 × 8 pelo uv da geometria: casas claras e escuras da cor do material. */
export const CHECKER_CODE = /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> SurfaceParams {
    let cell = vec2i(floor(s.uv * data.cells));
    let dark = ((cell.x + cell.y) & 1) == 1;
    let color = select(m.albedo.rgb, m.albedo.rgb * 0.15, dark);
    return SurfaceParams(vec4f(color, m.albedo.a), m.roughness, m.metallic, vec3f(0.0));
}`;
