import { wgslModule } from '../../../scene/shaders/WgslModule';
import { contactMath, impulse, lcp, quat, sdf, xpbd } from '../../gpu/shaders/math';
import {
    colliderDescStructs,
    rbContactStateStructs,
    rbContactStructs,
    rbSimParamsStructs,
    rigidBodyStructs,
} from '../../gpu/shaders/structs';
import rbPredictSource from '../../gpu/wgsl/kernels/rb_predict.wgsl?raw';
import rbNarrowphaseSource from '../../gpu/wgsl/kernels/rb_narrowphase.wgsl?raw';
import rbBuildLcpSource from '../../gpu/wgsl/kernels/rb_build_lcp.wgsl?raw';
import rbSolveLcpSource from '../../gpu/wgsl/kernels/rb_solve_lcp.wgsl?raw';
import rbContactAccumulateSource from '../../gpu/wgsl/kernels/rb_contact_accumulate.wgsl?raw';
import rbLcpCommitSource from '../../gpu/wgsl/kernels/rb_lcp_commit.wgsl?raw';

// Kernels do LCP de corpos rígidos (spec 004: contatos compactados, solve Jacobi paralelo, manifold de caixas).

const body = [rigidBodyStructs, rbSimParamsStructs];

/** Predição e gravidade por substep. */
export const rbPredict = wgslModule({
    name: 'rb_predict',
    source: rbPredictSource,
    requires: [...body, quat, impulse],
});

/** Narrowphase contra os 4 pools de collider (uma entrada por pool). */
export const rbNarrowphase = wgslModule({
    name: 'rb_narrowphase',
    source: rbNarrowphaseSource,
    requires: [
        ...body,
        rbContactStructs,
        rbContactStateStructs,
        colliderDescStructs,
        quat,
        impulse,
        sdf,
    ],
});

/** Montagem das linhas do LCP (Delassus, viés). */
export const rbBuildLcp = wgslModule({
    name: 'rb_build_lcp',
    source: rbBuildLcpSource,
    requires: [...body, rbContactStructs, quat, impulse, xpbd, contactMath, lcp],
});

/** Solve Jacobi paralelo (warm start, iteração por contato, aplicação por corpo, gravação do warm start). */
export const rbSolveLcp = wgslModule({
    name: 'rb_solve_lcp',
    source: rbSolveLcpSource,
    requires: [
        ...body,
        rbContactStructs,
        quat,
        impulse,
        xpbd,
        contactMath,
        lcp,
        rbContactStateStructs,
    ],
});

/** Correção posicional acumulada por corpo. */
export const rbContactAccumulate = wgslModule({
    name: 'rb_contact_accumulate',
    source: rbContactAccumulateSource,
    requires: [rbSimParamsStructs, rbContactStructs, rbContactStateStructs],
});

/** Commit do passo. */
export const rbLcpCommit = wgslModule({
    name: 'rb_lcp_commit',
    source: rbLcpCommitSource,
    requires: [...body, rbContactStructs, quat, impulse, xpbd, rbContactStateStructs],
});
