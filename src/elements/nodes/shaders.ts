import { wgslModule } from '../../scene/shaders/WgslModule';
import {
    NODE_COMPARE_EQUAL,
    NODE_COMPARE_GREATER,
    NODE_COMPARE_GREATER_EQUAL,
    NODE_COMPARE_LESS,
    NODE_COMPARE_LESS_EQUAL,
    NODE_COMPARE_NOT_EQUAL,
} from '../gpu/shaders/constants';
import { basis, color, noise, xformAffine, xformProjective, xformRigid } from '../gpu/shaders/math';
import { materialPointTypes } from '../material/point/shaders';
import { fieldAccelReady, fieldPointTypes } from '../physics/shaders/fields';
import mathSource from '../gpu/wgsl/nodes/math.wgsl?raw';
import mapSource from '../gpu/wgsl/nodes/map.wgsl?raw';
import noiseSource from '../gpu/wgsl/nodes/noise.wgsl?raw';
import colorSource from '../gpu/wgsl/nodes/color.wgsl?raw';
import conditionSource from '../gpu/wgsl/nodes/condition.wgsl?raw';
import spaceSource from '../gpu/wgsl/nodes/space.wgsl?raw';
import fieldSource from '../gpu/wgsl/nodes/field.wgsl?raw';
import surfaceSource from '../gpu/wgsl/nodes/surface.wgsl?raw';
import outputSource from '../gpu/wgsl/nodes/output.wgsl?raw';
import bsdfSource from '../gpu/wgsl/nodes/bsdf.wgsl?raw';
import closureSource from '../gpu/wgsl/nodes/closure.wgsl?raw';
import geometrySource from '../gpu/wgsl/nodes/geometry.wgsl?raw';
import { closure } from '../material/pbr/shaders';

/** Nós de matemática (spec 031): aritmética, interpolação, potência, trigonometria, vetores, separar/combinar. */
export const nodeMath = wgslModule({ name: 'node_math', source: mathSource });

/** Nós de mapeamento (spec 031): faixa e curva por pontos. */
export const nodeMap = wgslModule({ name: 'node_map', source: mapSource });

/** Nós de ruído (spec 031): valor, gradiente, celular e fBm com semente, sobre a `wgslLib.noise`. */
export const nodeNoise = wgslModule({ name: 'node_noise', source: noiseSource, requires: [noise] });

/** Nós de rampa de cor (spec 031). */
export const nodeColor = wgslModule({ name: 'node_color', source: colorSource, requires: [color] });

/** Nós de condição (spec 031): comparação (operações das constantes `NODE_COMPARE_*`) e escolha. */
export const nodeCondition = wgslModule({
    name: 'node_condition',
    source: conditionSource,
    requires: [
        NODE_COMPARE_LESS.module,
        NODE_COMPARE_LESS_EQUAL.module,
        NODE_COMPARE_GREATER.module,
        NODE_COMPARE_GREATER_EQUAL.module,
        NODE_COMPARE_EQUAL.module,
        NODE_COMPARE_NOT_EQUAL.module,
    ],
});

/** Nós de conversão de espaço (spec 031): ponto, direção, normal, inversa afim, projeção. */
export const nodeSpace = wgslModule({
    name: 'node_space',
    source: spaceSource,
    requires: [xformRigid, xformAffine, xformProjective],
});

/**
 * Nó de amostragem do campo da cena (spec 031): chama o `field_accel` pronto, que a C2 troca pela composição da cena
 * (ponto de cena `field`) em todo shader que o contém.
 */
export const nodeField = wgslModule({
    name: 'node_field',
    source: fieldSource,
    requires: [fieldPointTypes, fieldAccelReady],
});

/** Nós de geometria diferencial (spec 031): métrica, curvaturas, direções principais da amostra de superfície. */
export const nodeSurface = wgslModule({ name: 'node_surface', source: surfaceSource });

/** Nós de saída do ponto `material` (spec 031; o de fechamento, spec 011). */
export const nodeOutput = wgslModule({
    name: 'node_output',
    source: outputSource,
    requires: [materialPointTypes, closure],
});

/** Nós de espalhamento (spec 011): um lobo cada, sobre os construtores do fechamento. */
export const nodeBsdf = wgslModule({ name: 'node_bsdf', source: bsdfSource, requires: [closure] });

/** Nós de composição de fechamentos (spec 011). */
export const nodeClosure = wgslModule({
    name: 'node_closure',
    source: closureSource,
    requires: [closure],
});

/** Nó de tangente pelo uv (spec 011): referencial cotangente das derivadas de tela (só `fragment`). */
export const nodeGeometry = wgslModule({
    name: 'node_geometry',
    source: geometrySource,
    requires: [basis],
});
