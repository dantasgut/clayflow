// Worker do traçador de caminhos da CPU (smokes da spec 033): renderiza uma faixa de linhas e devolve os buffers.
import {
    renderPathTraced,
    type PtCamera,
    type PtOptions,
    type PtScene,
} from '../../elements/lighting/reference/pathTracer';

self.onmessage = (e: MessageEvent<{ scene: PtScene; camera: PtCamera; opts: PtOptions }>): void => {
    const img = renderPathTraced(e.data.scene, e.data.camera, e.data.opts);
    (self as unknown as Worker).postMessage(img, [
        img.rgb.buffer,
        img.ids.buffer,
        img.faces.buffer,
    ]);
};
