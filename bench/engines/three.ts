import * as THREE from 'three/webgpu';
import type { EngineAdapter, FrameSample, SceneImplementation } from '../core/types';
import { estimateThreeMemory } from './threeMemory';

/** Handle do Three entregue às cenas. */
export interface ThreeHandle {
    readonly THREE: typeof THREE;
    readonly renderer: THREE.WebGPURenderer;
    readonly scene: THREE.Scene;
    readonly camera: THREE.PerspectiveCamera;
    gpuMs: number | undefined;
    gpuSampleId: number;
    resolving: boolean;
}

/**
 * Luz equivalente à iluminação padrão do forward do clayflow (direção `[0.4, -1, 0.6]`,
 * ambiente 0.18 + difusa 0.82, sem sombra).
 */
function addDefaultLighting(scene: THREE.Scene): void {
    scene.add(new THREE.AmbientLight(0xffffff, 0.18 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, 0.82 * Math.PI);
    sun.position.set(-0.4, 1, -0.6);
    scene.add(sun);
}

/**
 * Adaptador Three.js com `WebGPURenderer` (mesma API gráfica — R1). CPU = `performance.now()`
 * em volta de `update` + `render`; GPU = timestamps do próprio renderer (`trackTimestamp`),
 * resolvidos de forma assíncrona e contados uma vez por leitura.
 */
export function createThreeAdapter(): EngineAdapter<ThreeHandle> {
    return {
        id: 'three',
        version: THREE.REVISION,
        async init(canvas, resolution, cameraSpec) {
            const renderer = new THREE.WebGPURenderer({
                canvas,
                antialias: false,
                trackTimestamp: true,
            });
            await renderer.init();
            renderer.setPixelRatio(1);
            renderer.setSize(resolution.width, resolution.height, false);
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000);
            const camera = new THREE.PerspectiveCamera(
                cameraSpec.fovDeg,
                resolution.width / resolution.height,
                0.1,
                1000,
            );
            camera.position.set(...cameraSpec.position);
            camera.lookAt(...cameraSpec.target);
            addDefaultLighting(scene);
            return {
                THREE,
                renderer,
                scene,
                camera,
                gpuMs: undefined,
                gpuSampleId: 0,
                resolving: false,
            };
        },
        capabilities(handle) {
            return { gpuTiming: handle.gpuMs !== undefined, memory: 'estimated' };
        },
        frame(handle, scene: SceneImplementation<ThreeHandle>, dtSeconds): FrameSample {
            const t0 = performance.now();
            scene.update?.(dtSeconds);
            handle.renderer.render(handle.scene, handle.camera);
            const cpuMs = performance.now() - t0;
            const drawCalls = handle.renderer.info.render.drawCalls;
            if (!handle.resolving) {
                handle.resolving = true;
                handle.renderer
                    .resolveTimestampsAsync('render')
                    .then((ms) => {
                        if (typeof ms === 'number' && ms > 0) {
                            handle.gpuMs = ms;
                            handle.gpuSampleId++;
                        }
                    })
                    .catch(() => undefined)
                    .finally(() => {
                        handle.resolving = false;
                    });
            }
            return {
                cpuMs,
                drawCalls,
                ...(handle.gpuMs !== undefined
                    ? { gpuMs: handle.gpuMs, gpuSampleId: handle.gpuSampleId }
                    : {}),
            };
        },
        memoryBytes(handle) {
            return estimateThreeMemory(handle.scene);
        },
        gpuReading(handle) {
            return handle.gpuMs !== undefined
                ? { gpuMs: handle.gpuMs, id: handle.gpuSampleId }
                : undefined;
        },
        dispose(handle) {
            void handle.renderer.dispose();
        },
    };
}
