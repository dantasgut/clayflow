// Cenas e leituras comuns aos smokes de materiais da spec 011 (`materials`, `lighting`): aplicação de teste, câmeras
// ortográficas de vista conhecida e a leitura do alvo HDR depois de compilar.
import {
    Application,
    Camera,
    createScene,
    MaterialFunction,
    NodeGraph,
    nodes,
    Transform,
} from 'clayflow';
import type { LobeName } from 'clayflow';
import { settle } from './extensionScenes';
import { readHdrTexture, type HdrImage } from './imageMeasures';

/** Aplicação de teste com os erros dos estágios e das extensões coletados em `errors`. */
export async function materialApp(
    width: number,
    height: number,
    errors: string[],
    options: { readonly profiling?: boolean } = {},
): Promise<{ app: Application; canvas: HTMLCanvasElement }> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const app = await Application.create({
        canvas,
        scene: createScene(),
        autoResize: false,
        captureErrors: true,
        ...(options.profiling === true ? { profiling: 'frame' as const } : {}),
    });
    app.events.on('engineError', (e) => errors.push(`${e.stage}: ${e.message}`));
    app.events.on('extensionRejected', (e) =>
        errors.push(`extensionRejected ${e.point}:${e.line}: ${e.message}`),
    );
    return { app, canvas };
}

/** Libera a aplicação e o canvas. */
export function disposeApp(app: Application, canvas: HTMLCanvasElement): void {
    app.dispose();
    canvas.remove();
}

/** Câmera ortográfica de frente (olhando −z), `height` unidades na vertical, centrada na origem. */
export function frontCamera(app: Application, height: number, z = 6): void {
    app.world.insert(
        new Camera({ projection: 'orthographic', orthoHeight: height, near: 0.1, far: 30 }).add(
            new Transform({
                position: [0, 0, z, 1],
                rotation: Transform.lookRotation([0, 0, z], [0, 0, 0]),
            }),
        ),
    );
}

/** Pixel do ponto de mundo (x, y) na câmera de frente (y para cima na tela). */
export function frontPixel(
    x: number,
    y: number,
    height: number,
    w: number,
    h: number,
): [number, number] {
    const width = (height * w) / h;
    return [Math.floor((x / width + 0.5) * w), Math.floor((0.5 - y / height) * h)];
}

/** Lê o alvo HDR da cena depois de compilar e desenhar `frames` quadros. */
export async function renderHdr(app: Application, frames = 1, ms = 800): Promise<HdrImage> {
    await settle(app, ms);
    for (let i = 0; i < frames; i++) app.step(1 / 60);
    const texture = app.resources.textureOf(app.defaults.targets, 'color');
    if (texture === undefined) throw new Error('alvo HDR não alocado');
    return readHdrTexture(app, texture);
}

/** Função `material` de fechamento escrita em WGSL, com os lobos declarados. */
export function closureFn(
    body: string,
    lobes: readonly LobeName[],
    params: Readonly<Record<string, 'f32' | 'vec3f'>> = {},
    values: Readonly<Record<string, number | number[]>> = {},
): MaterialFunction {
    return new MaterialFunction({
        code: `fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {\n${body}\n}`,
        params,
        values,
        lobes,
    });
}

/** Grafo de material: os nós dados, as ligações e a saída do nó `out` (um fechamento) em `output.closure`. */
export function materialGraph(
    graphNodes: ConstructorParameters<typeof NodeGraph>[0]['nodes'],
    links: ConstructorParameters<typeof NodeGraph>[0]['links'],
    out: string,
): MaterialFunction {
    return new MaterialFunction({
        graph: new NodeGraph({
            nodes: { ...graphNodes, material_out: nodes.output.closure },
            links: [...links, [out, 'material_out.closure']],
            output: 'material_out.value',
        }),
    });
}
