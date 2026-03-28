# Interface: RigidBodySimConfig

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:7](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L7)

Configuração da simulação de corpos rígidos GPU.

Parâmetros do pipeline GPU (XPBD / LCP): iterações, damping, thresholds.
Campos de pipeline CPU (resolution, gyroscopic) foram removidos (GPU-only).

## Properties

### baumgarteBeta?

> `optional` **baumgarteBeta?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:50](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L50)

Fator de correção de Baumgarte [0.1–0.3] para o solver LCP/PGS.
Controla a velocidade de correção de penetração por bias do constraint.
Valores altos convergem mais rápido mas podem introduzir instabilidade.
Default: 0.2.

***

### globalAngularDamping?

> `optional` **globalAngularDamping?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:69](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L69)

Amortecimento angular global aplicado após rb_velocity_recovery (1/s, exponencial).
Atua em todos os corpos, complementando o angularDamping por corpo (RigidBodyMaterial).
Default: 3.0 (~95% de velocidade angular por segundo).

***

### globalLinearDamping?

> `optional` **globalLinearDamping?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:63](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L63)

Amortecimento linear global aplicado após rb_velocity_recovery (1/s, exponencial).
Atua em todos os corpos, complementando o linearDamping por corpo (RigidBodyMaterial).
0 = desativado. Default: 0.05 (~5% de velocidade linear por segundo).

***

### iterations?

> `optional` **iterations?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:12](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L12)

Número de iterações do solver PGS por substep (backend='gpu').
Default: 15. (Otimização 3c — compensa substeps=4 vs. substeps=8 anteriores)

***

### predictiveThreshold?

> `optional` **predictiveThreshold?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:25](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L25)

Margem especulativa para detecção de contatos iminentes (backend='gpu').
0 = desativado (padrão). Valores > 0 ativam contatos especulativos para prevenir
tunelamento em corpos velozes. Valor sugerido: 0.05 (5 cm).
Default: 0 (desativado).

***

### profilerLogInterval?

> `optional` **profilerLogInterval?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:18](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L18)

Intervalo de frames entre leituras do profiler GPU (backend='gpu').
Valores menores aumentam a frequência dos logs de tempo de kernel.
Default: 60 (≈1 log/s a 60fps).

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:31](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L31)

Coeficiente de restituição (elasticidade) para colisões normais [0–1].
0 = completamente inelástico (sem quique), 1 = elástico (sem perda de energia).
Default: 0.3 (queda de 1 m → quique de ~55 cm → ~30 cm → repouso).

***

### restitutionThreshold?

> `optional` **restitutionThreshold?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:37](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L37)

Velocidade de aproximação (m/s) abaixo da qual o coeficiente de restituição é
forçado a zero, eliminando micro-quiques em colisões de baixa energia (backend='gpu').
Default: 0.5 (m/s — queda de ~1.3 cm ou menos → repouso direto).

***

### sleepLinThreshold?

> `optional` **sleepLinThreshold?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:43](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L43)

Velocidade linear (m/s) abaixo da qual o corpo é considerado em repouso e tem
vel/omega zerados (pseudo-sleep) para evitar vibração residual (backend='gpu').
0 = desativado. Default: 0.01 (1 cm/s).

***

### warmStartFactor?

> `optional` **warmStartFactor?**: `number`

Defined in: [scene/systems/simulation/RigidBodySimConfig.ts:57](https://github.com/dantasgut/clayflow/blob/bd87702a19ea27821f269c4fd9796e0879474a2a/src/scene/systems/simulation/RigidBodySimConfig.ts#L57)

Fator de escala para warm starting do solver LCP/PGS [0.8–1.0].
Escala os impulsos acumulados do frame anterior usados como solução inicial.
1.0 = warm start completo; 0.0 = desativado.
Default: 0.85.
