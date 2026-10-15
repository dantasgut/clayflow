// Apoio do smoke dos pontos de extensão (spec 009): leitura de pools de volta (só no smoke), espera das compilações
// assíncronas (quadros de duração 0: a cena reconcilia sem avançar o tempo), captura de pixels e as funções WGSL dos
// exemplos.
import type { Application, EntityId, StagingBufferSpec } from 'clayflow';

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
