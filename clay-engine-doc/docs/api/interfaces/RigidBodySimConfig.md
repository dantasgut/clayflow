# Interface: RigidBodySimConfig

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:7](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L7)

Configuração da simulação de corpos rígidos GPU.

Parâmetros do pipeline GPU (XPBD / LCP): iterações, damping, thresholds.
Campos de pipeline CPU (resolution, gyroscopic) foram removidos (GPU-only).

## Properties

### baumgarteBeta?

> `optional` **baumgarteBeta?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:44](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L44)

Fator de correção de Baumgarte [0.1–0.3] para o solver LCP/PGS.
Controla a velocidade de correção de penetração por bias do constraint.
Valores altos convergem mais rápido mas podem introduzir instabilidade.
Default: 0.2.

***

### globalAngularDamping?

> `optional` **globalAngularDamping?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:57](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L57)

Amortecimento angular global aplicado a todos os corpos por frame (LCP).
Valor alto reduz rotação livre; valor baixo permite tipping e rolagem natural.
Default: 0.5 (equivalente ao pipeline XPBD).

***

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L12)

Número de iterações do solver PGS por substep (backend='gpu').
Default: 15. (Otimização 3c — compensa substeps=4 vs. substeps=8 anteriores)

***

### predictiveThreshold?

> `optional` **predictiveThreshold?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:25](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L25)

Margem especulativa para detecção de contatos iminentes (backend='gpu').
0 = desativado (padrão). Valores > 0 ativam contatos especulativos para prevenir
tunelamento em corpos velozes. Valor sugerido: 0.05 (5 cm).
Default: 0 (desativado).

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:18](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L18)

Intervalo de frames entre leituras do profiler GPU (backend='gpu').
Valores menores aumentam a frequência dos logs de tempo de kernel.
Default: 60 (≈1 log/s a 60fps).

***

### restitutionThreshold?

> `optional` **restitutionThreshold?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:31](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L31)

Velocidade de aproximação (m/s) abaixo da qual o coeficiente de restituição é
forçado a zero, eliminando quique em colisões de baixa energia (backend='gpu').
Default: 2.0 (m/s — queda de ~20 cm já não quica).

***

### sleepLinThreshold?

> `optional` **sleepLinThreshold?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:37](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L37)

Velocidade linear (m/s) abaixo da qual o corpo é considerado em repouso e tem
vel/omega zerados (pseudo-sleep) para evitar vibração residual (backend='gpu').
0 = desativado. Default: 0.01 (1 cm/s).

***

### warmStartFactor?

> `optional` **warmStartFactor?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:51](https://github.com/dantasgut/clayflow/blob/206f9504f31474f1f55957b1d36c583844789973/src/scene/systems/simulation/RigidBodySimConfig.ts#L51)

Fator de escala para warm starting do solver LCP/PGS [0.8–1.0].
Escala os impulsos acumulados do frame anterior usados como solução inicial.
1.0 = warm start completo; 0.0 = desativado.
Default: 0.85.
