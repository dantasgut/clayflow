// O traçador de caminhos da CPU em paralelo (smokes da spec 033): as linhas em faixas, uma por worker, compostas na
// mesma imagem da renderização sequencial (a semente é por pixel) — e a página continua respondendo durante a conta.
// A cena vai por mensagem: só cenas sem funções (o céu como função fica na renderização sequencial).
import type {
    PtCamera,
    PtImage,
    PtOptions,
    PtScene,
} from '../../elements/lighting/reference/pathTracer';

/** Renderiza `scene` em `workers` faixas paralelas (padrão: os núcleos do navegador). */
export async function renderPathTracedParallel(
    scene: PtScene,
    camera: PtCamera,
    opts: PtOptions,
    workers = Math.max(1, Math.min(16, navigator.hardwareConcurrency || 4)),
): Promise<PtImage> {
    const { width, height } = opts;
    const out: PtImage = {
        width,
        height,
        rgb: new Float32Array(width * height * 3),
        ids: new Int32Array(width * height).fill(-1),
        faces: new Int8Array(width * height).fill(-1),
    };
    // Faixas finas intercaladas equilibram as regiões caras e as baratas entre os workers.
    const band = Math.max(1, Math.ceil(height / (workers * 8)));
    const bands: [number, number][] = [];
    for (let y = 0; y < height; y += band) bands.push([y, Math.min(height, y + band)]);
    const run = async (): Promise<void> => {
        const worker = new Worker(new URL('./pathTraceWorker.ts', import.meta.url), {
            type: 'module',
        });
        try {
            for (let rows = bands.shift(); rows !== undefined; rows = bands.shift()) {
                const img = await new Promise<PtImage>((resolve, reject) => {
                    worker.onmessage = (e: MessageEvent<PtImage>): void => {
                        resolve(e.data);
                    };
                    worker.onerror = (e): void => {
                        reject(new Error(e.message));
                    };
                    worker.postMessage({ scene, camera, opts: { ...opts, rows } });
                });
                const [a, b] = rows;
                out.rgb.set(img.rgb.subarray(a * width * 3, b * width * 3), a * width * 3);
                out.ids.set(img.ids.subarray(a * width, b * width), a * width);
                out.faces.set(img.faces.subarray(a * width, b * width), a * width);
            }
        } finally {
            worker.terminate();
        }
    };
    await Promise.all(Array.from({ length: workers }, run));
    return out;
}
