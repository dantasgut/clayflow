import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeColor } from '../shaders';
import { ramp, ramp4 } from '../map';

// Nós de cor (spec 031: as rampas; spec 011: componentes, HSV, temperatura e luminância). Cores lineares.

/** Cor das componentes `r`, `g`, `b` (cada uma com valor ou ligação). */
const rgb = defineNode({
    name: 'color.rgb',
    inputs: { r: 'f32', g: 'f32', b: 'f32' },
    outputs: { value: 'vec3f' },
    params: {
        r: { type: 'f32', default: 1 },
        g: { type: 'f32', default: 1 },
        b: { type: 'f32', default: 1 },
    },
    code: nodeColor,
    fn: 'node_color_rgb',
});

/** Cor de matiz (voltas em [0, 1)), saturação e valor. */
const hsv = defineNode({
    name: 'color.hsv',
    inputs: { h: 'f32', s: 'f32', v: 'f32' },
    outputs: { value: 'vec3f' },
    params: {
        h: { type: 'f32', default: 0 },
        s: { type: 'f32', default: 1 },
        v: { type: 'f32', default: 1 },
    },
    code: nodeColor,
    fn: 'node_color_hsv',
});

/** Cor de corpo negro da temperatura em K (1000–40000), normalizada no máximo 1. */
const temperature = defineNode({
    name: 'color.temperature',
    inputs: { kelvin: 'f32' },
    outputs: { value: 'vec3f' },
    params: { kelvin: { type: 'f32', default: 6500 } },
    code: nodeColor,
    fn: 'node_color_temperature',
});

/** Luminância (Rec. 709) de uma cor linear. */
const luminance = defineNode({
    name: 'color.luminance',
    inputs: { c: 'vec3f' },
    outputs: { value: 'f32' },
    code: nodeColor,
    fn: 'node_color_luminance',
});

/** Nós de cor. */
export const color = { ramp, ramp4, rgb, hsv, temperature, luminance } as const;
