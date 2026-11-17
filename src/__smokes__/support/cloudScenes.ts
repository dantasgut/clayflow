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
import type { CloudVolume } from '../../elements/media/clouds/reference/cloudModel';

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
        ...(o.profiling === true ? { profiling: 'passes' as const } : {}),
    });
    const errors: string[] = [];
    app.events.on('engineError', (e) => errors.push(`${e.stage}: ${e.message}`));
    if (o.profile !== undefined) app.defaults.renderer.profile = o.profile;
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
    format: 'rgba8unorm' | 'rgba16float',
): Promise<{ width: number; height: number; depth: number; data: Float32Array }> {
    const { width, height } = texture;
    const depth = texture.depthOrArrayLayers ?? 1;
    const texel = format === 'rgba8unorm' ? 4 : 8;
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
    for (let z = 0; z < depth; z++)
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width * 4; x++) {
                const o = (z * height + y) * width * 4 + x;
                const row = z * height * bytesPerRow + y * bytesPerRow;
                data[o] =
                    format === 'rgba8unorm' ? u8[row + x]! / 255 : halfToFloat(u16[row / 2 + x]!);
            }
    return { width, height, depth, data };
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
