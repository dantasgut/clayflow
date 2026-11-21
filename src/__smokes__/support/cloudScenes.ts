// Spec 041 — Cenas das nuvens montadas pelo caminho de autoria (`Sky` + `CloudLayer`, câmera por `Transform`) e as
// leituras dos alvos da camada para os smokes (os volumes `rgba8unorm`, os alvos `rgba16float`).
import {
    Application,
    Camera,
    CloudLayer,
    createScene,
    DirectionalLight,
    Sky,
    Transform,
    type CloudLayerValues,
    type StagingBufferSpec,
    type TextureSpec,
} from 'clayflow/web';
import { halfToFloat } from './imageMeasures';
import { readBuffer } from './extensionScenes';
import type { CloudVolume } from '../../elements/media/clouds/reference/cloudModel';
import type { ShadowAtlas } from '../../elements/media/clouds/reference/cloudShadowPages';
import {
    CLOUD_SCATTER_GLOBAL_WORDS,
    CLOUD_SCATTER_HEADER_WORDS,
    CLOUD_SCATTER_PAGE,
    CLOUD_SCATTER_PROBE_WORDS,
    CLOUD_SHADOW_SLOT_COUNT,
    CLOUD_SHADOW_STATE_SLOT,
    CloudShadowPageViewSchema,
} from '../../elements/media/clouds/schemas';

/** Uma cena de nuvens. */
export interface CloudScene {
    readonly app: Application;
    readonly canvas: HTMLCanvasElement;
    readonly sun: DirectionalLight;
    readonly sky: Sky;
    readonly layer: CloudLayer | undefined;
    readonly camera: Transform;
    readonly cameraResource: Camera;
    readonly errors: string[];
}

/** Opções da cena. */
export interface CloudSceneOptions {
    readonly width?: number;
    readonly height?: number;
    /** Elevação do sol (graus) e azimute (graus, 0 = +x). */
    readonly sunElevation?: number;
    readonly sunAzimuth?: number;
    /** Iluminância do sol (lux fora da atmosfera). */
    readonly sunLux?: number;
    /** A camada (sem: só o céu). */
    readonly clouds?: CloudLayerValues | false;
    /** Posição da câmera e ponto para onde olha. */
    readonly eye?: readonly [number, number, number];
    readonly target?: readonly [number, number, number];
    /** Campo de visão vertical (rad). */
    readonly fov?: number;
    readonly far?: number;
    readonly profile?: 'high' | 'medium' | 'low';
    /** Mede o tempo de GPU por passe (`gpuFrameTimed`). */
    readonly profiling?: boolean;
}

/** Direção de propagação da luz do sol (para longe do sol). */
export function sunTravel(elevation: number, azimuth = 0): number[] {
    const e = (elevation * Math.PI) / 180;
    const a = (azimuth * Math.PI) / 180;
    return [-Math.cos(e) * Math.cos(a), -Math.sin(e), -Math.cos(e) * Math.sin(a), 0];
}

/** Monta a cena: o sol, o céu, a camada e a câmera. */
export async function cloudScene(o: CloudSceneOptions = {}): Promise<CloudScene> {
    const width = o.width ?? 640;
    const height = o.height ?? 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        // A imagem apresentada legível (`readCanvas`): os casos de movimento a medem depois da resolução temporal.
        canvasOptions: { capture: true },
        ...(o.profiling === true ? { profiling: 'passes' as const } : {}),
    });
    const errors: string[] = [];
    app.events.on('engineError', (e) => errors.push(`${e.stage}: ${e.message}`));
    // O perfil da cena, ou o da página (`--query profile=low`: os casos de exatidão no perfil baixo, T035).
    const pageProfile = new URLSearchParams(location.search).get('profile');
    const profile =
        o.profile
        ?? (pageProfile === 'high' || pageProfile === 'medium' || pageProfile === 'low'
            ? pageProfile
            : undefined);
    if (profile !== undefined) app.defaults.renderer.profile = profile;
    const sun = new DirectionalLight({
        direction: sunTravel(o.sunElevation ?? 60, o.sunAzimuth ?? 0),
        intensity: o.sunLux ?? 1000,
    });
    app.world.insert(sun);
    const sky = new Sky({ sun });
    app.world.insert(sky);
    const layer = o.clouds === false ? undefined : new CloudLayer(o.clouds ?? {});
    if (layer !== undefined) app.world.insert(layer);
    const eye = o.eye ?? [0, 2, 0];
    const target = o.target ?? [1000, 600, 0];
    const camera = new Transform({
        position: [eye[0], eye[1], eye[2], 1],
        rotation: Transform.lookRotation([...eye], [...target]),
    });
    const cameraResource = new Camera({
        fov: o.fov ?? Math.PI / 3,
        aspect: width / height,
        aspectMode: 'fixed',
        near: 0.5,
        far: o.far ?? 200_000,
    });
    app.world.insert(cameraResource.add(camera));
    return { app, canvas, sun, sky, layer, camera, cameraResource, errors };
}

/** Descarta a cena. */
export function disposeCloudScene(s: CloudScene): void {
    s.app.dispose();
    s.canvas.remove();
}

/** Lê uma textura 2D ou 3D `rgba8unorm` (valores em [0, 1]) ou `rgba16float`. */
export async function readTexture(
    app: Application,
    texture: TextureSpec,
    format: 'rgba8unorm' | 'rgba16float' | 'rgba32float',
): Promise<{ width: number; height: number; depth: number; data: Float32Array }> {
    const { width, height } = texture;
    const depth = texture.depthOrArrayLayers ?? 1;
    const texel = format === 'rgba8unorm' ? 4 : format === 'rgba16float' ? 8 : 16;
    const bytesPerRow = Math.ceil((width * texel) / 256) * 256;
    const staging = app.core.create<StagingBufferSpec>({
        kind: 'buffer',
        subkind: 'staging',
        discriminator: `cloud_readback_${width}x${height}x${depth}_${format}`,
        byteSize: bytesPerRow * height * depth,
    });
    app.core.record('cloud-readback', (frame) => {
        frame.copyTextureToBuffer(texture, staging, { bytesPerRow, rowsPerImage: height }, [
            width,
            height,
            depth,
        ]);
    });
    app.core.submit();
    const raw = await app.core.readback(staging);
    app.core.destroy(staging);
    const data = new Float32Array(width * height * depth * 4);
    const u8 = new Uint8Array(raw);
    const u16 = new Uint16Array(raw);
    const f32 = new Float32Array(raw);
    for (let z = 0; z < depth; z++)
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width * 4; x++) {
                const o = (z * height + y) * width * 4 + x;
                const row = z * height * bytesPerRow + y * bytesPerRow;
                data[o] =
                    format === 'rgba8unorm'
                        ? u8[row + x]! / 255
                        : format === 'rgba16float'
                          ? halfToFloat(u16[row / 2 + x]!)
                          : f32[row / 4 + x]!;
            }
    return { width, height, depth, data };
}

/**
 * O mapa visto do sol por páginas lido da GPU (spec 041, R11 revisto): o atlas, o sol do desenho de cada página física
 * (os campos `sun_*` do registro da série `shadowPages`) e os mapas do quadro (o registro de estado
 * `CLOUD_SHADOW_STATE_SLOT`: o degrau de onde, o para onde e o peso).
 */
export async function readShadowMap(app: Application, layer: CloudLayer): Promise<ShadowAtlas> {
    const t = app.resources.textureOf(layer, 'shadow');
    const b = app.resources.bufferOf(layer, 'shadowPages');
    if (t === undefined || b === undefined) throw new Error('mapa visto do sol não alocado');
    const atlas = await readTexture(app, t, 'rgba16float');
    const raw = await readBuffer(app, b, 'cloud_shadow_pages');
    const suns = new Float32Array(CLOUD_SHADOW_SLOT_COUNT * 3);
    const words = CloudShadowPageViewSchema.stride / 4;
    const sun = CloudShadowPageViewSchema.offsetOf('sun_x') / 4;
    for (let i = 0; i < CLOUD_SHADOW_SLOT_COUNT; i++)
        for (let c = 0; c < 3; c++) suns[i * 3 + c] = raw[i * words + sun + c]!;
    const ints = new Int32Array(raw.buffer, raw.byteOffset, raw.length);
    const state = CLOUD_SHADOW_STATE_SLOT * words;
    const maps = {
        leaving: ints[state + CloudShadowPageViewSchema.offsetOf('page_x') / 4]!,
        entering: ints[state + CloudShadowPageViewSchema.offsetOf('page_y') / 4]!,
        weight: raw[state + CloudShadowPageViewSchema.offsetOf('time') / 4]!,
    };
    return { ...atlas, suns, maps };
}

/**
 * O cache de espalhamento lido da GPU como uma grade (x mais rápido, depois a altitude, depois z; 8 valores por sonda: a
 * soma da parte do sol por unidade da luz do sol que chega à sonda, a contagem, a soma da parte do céu por unidade da
 * irradiância do céu e uma livre — T074): as sondas das páginas da série por páginas `scatter` (T023; R11 revisto).
 */
export async function readScatterCache(
    app: Application,
    layer: CloudLayer,
): Promise<{ width: number; height: number; depth: number; data: Float32Array }> {
    const b = app.resources.bufferOf(layer, 'scatter');
    if (b === undefined) throw new Error('cache de espalhamento não alocado');
    const raw = await readBuffer(app, b, 'cloud_scatter_cache');
    const [w, h, d] = layer.quality.scatter.size;
    const P = CLOUD_SCATTER_PAGE;
    const n = [w / P, h / P, d / P];
    const pages = n[0]! * n[1]! * n[2]!;
    const base = CLOUD_SCATTER_GLOBAL_WORDS + pages * CLOUD_SCATTER_HEADER_WORDS;
    const W = CLOUD_SCATTER_PROBE_WORDS;
    const data = new Float32Array(w * h * d * W);
    for (let z = 0; z < d; z++)
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const p =
                    Math.floor(x / P) + n[0]! * (Math.floor(y / P) + n[1]! * Math.floor(z / P));
                const l = (x % P) + P * ((y % P) + P * (z % P));
                const o = base + (p * P ** 3 + l) * W;
                for (let c = 0; c < W; c++) data[((z * h + y) * w + x) * W + c] = raw[o + c]!;
            }
    return { width: w, height: h, depth: d, data };
}

/** Um volume da camada lido da GPU, na representação da referência. */
export async function readCloudVolume(
    app: Application,
    layer: CloudLayer,
    id: 'shape' | 'detail',
): Promise<CloudVolume> {
    const t = app.resources.textureOf(layer, id);
    if (t === undefined) throw new Error(`volume '${id}' não alocado`);
    const r = await readTexture(app, t, 'rgba8unorm');
    return { size: r.width, data: r.data };
}
