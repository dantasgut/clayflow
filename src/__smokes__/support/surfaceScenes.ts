// Apoio do smoke das superfícies paramétricas (spec 010): o vale de teste (função do usuário com fórmula conhecida na
// CPU), leitura das partículas e do campo de um colisor de volta (só no smoke).
import type * as Clayflow from 'clayflow/web';
import type { Application, EntityId, StructSchema } from 'clayflow/web';
import { readPool } from './extensionScenes';

type ClayflowLib = typeof Clayflow;

/** Vale: y = depth · (x² + z²) / r² − depth (fundo em −depth na origem), u = z e v = x (normal para cima). */
export const VALLEY_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let h = data.depth * (u * u + v * v) / (data.r * data.r) - data.depth;
    return vec3f(v, h, u);
}`;

/** Vale que sobe e desce: o fundo oscila `amp · sen(ω t)` (o colisor acompanha por passo). */
export const VALLEY_ANIMATED_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    let h = data.depth * (u * u + v * v) / (data.r * data.r) - data.depth + data.amp * sin(data.omega * time);
    return vec3f(v, h, u);
}`;

/** Forma do vale: profundidade, raio em que a altura volta a 0 e meia largura do domínio. */
export interface ValleyShape {
    readonly depth: number;
    readonly r: number;
    readonly half: number;
}

/** Parâmetros do vale de teste. */
export const VALLEY: ValleyShape = { depth: 0.8, r: 1.2, half: 1.6 };

/** Vale do lago (escala da água da 017: espaçamento de 2,5 cm). */
export const LAKE_VALLEY: ValleyShape = { depth: 0.3, r: 0.6, half: 1 };

/** Altura do vale de teste em (x, z) (a mesma fórmula da função), com o deslocamento animado. */
export function valleyHeight(x: number, z: number, lift = 0, shape: ValleyShape = VALLEY): number {
    return (shape.depth * (x * x + z * z)) / (shape.r * shape.r) - shape.depth + lift;
}

/** Insere o vale colidível (malha 96², colisor de altura 128²) com material e `Transform`. */
export function insertValley(
    app: Application,
    lib: ClayflowLib,
    options: {
        animated?: { amp: number; omega: number };
        resolution?: number;
        shape?: ValleyShape;
        albedo?: readonly [number, number, number];
    } = {},
): { id: EntityId; surface: Clayflow.ParametricSurface; collider: Clayflow.SurfaceCollider } {
    const { ParametricSurface, StandardMaterial, SurfaceCollider, SurfaceFunction, Transform } =
        lib;
    const shape = options.shape ?? VALLEY;
    const h = shape.half;
    const surface = new ParametricSurface({
        resolution: [96, 96],
        domain: [-h, h, -h, h],
        animated: options.animated !== undefined,
    });
    const fn =
        options.animated === undefined
            ? new SurfaceFunction({
                  code: VALLEY_CODE,
                  params: { depth: 'f32', r: 'f32' },
                  values: { depth: shape.depth, r: shape.r },
              })
            : new SurfaceFunction({
                  code: VALLEY_ANIMATED_CODE,
                  params: { depth: 'f32', r: 'f32', amp: 'f32', omega: 'f32' },
                  values: {
                      depth: shape.depth,
                      r: shape.r,
                      amp: options.animated.amp,
                      omega: options.animated.omega,
                  },
              });
    const collider = new SurfaceCollider({
        mode: 'height',
        resolution: options.resolution ?? 128,
    });
    const entity = surface
        .add(fn)
        .add(collider)
        .add(new StandardMaterial({ albedo: [...(options.albedo ?? [0.55, 0.5, 0.4]), 1] }))
        .add(new Transform());
    return { id: app.world.insert(entity), surface, collider };
}

/** Posições (xyz) de todos os elementos do pool `schema` (campo `field`, padrão `pos`). */
export async function readPositions(
    app: Application,
    schema: StructSchema,
    field = 'pos',
): Promise<[number, number, number][]> {
    const bytes = await readPool(app, schema.name);
    const count = app.resources.poolCount(schema.name);
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const stride = schema.stride / 4;
    const at = schema.offsetOf(field) / 4;
    const out: [number, number, number][] = [];
    for (let e = 0; e < count; e++) {
        const o = e * stride + at;
        out.push([f[o]!, f[o + 1]!, f[o + 2]!]);
    }
    return out;
}

/** Cópia 0 do campo de um colisor: caixa local e valores (lidos do pool do campo). */
export async function readField(
    app: Application,
    lib: ClayflowLib,
    id: EntityId,
    collider: Clayflow.SurfaceCollider,
): Promise<{ lo: number[]; hi: number[]; built: number; values: Float32Array }> {
    const key = lib.SurfaceCollider.cellSchema.name;
    const bytes = await readPool(app, key);
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const first = app.resources.poolSlotOf(key, id);
    if (first === undefined) throw new Error('colisor sem campo');
    const u = new Uint32Array(f.buffer, f.byteOffset, f.length);
    const header = lib.SURFACE_COLLIDER_HEADER;
    return {
        lo: [f[first]!, f[first + 1]!, f[first + 2]!],
        hi: [f[first + 4]!, f[first + 5]!, f[first + 6]!],
        built: u[first + 37]!,
        values: f.slice(first + header, first + header + collider.cellCount),
    };
}
