- **Protocolo**: aquecimento 3000 ms, janela 10000 ms, 3 repetição(ões)

| Cena               | Variante      | CPU ms (clay / three / ×)         | GPU ms (clay / three / ×)         | FPS (clay / three)           | p99 ms (clay / three)          | Draw calls (clay / three)    | Memória MB (clay / three\*)    |
| ------------------ | ------------- | --------------------------------- | --------------------------------- | ---------------------------- | ------------------------------ | ---------------------------- | ------------------------------ |
| instances          | 10k           | 0.05 / 0.03 / 1.67×               | 0.67 / 0.09 / 7.28×               | 999 / 11344                  | 1.97 / 0.26                    | 2 / 2                        | 28.2 / 0.7\*                   |
| instances          | 100k          | 0.06 ⚠ / 0.03 ⚠ / 1.83×           | 0.98 ⚠ / 0.51 ⚠ / 1.90×           | 693 ⚠ / 4124 ⚠               | 4.62 ⚠ / 0.76 ⚠                | 2 ⚠ / 2 ⚠                    | 52.7 ⚠ / 7.2 ⚠\*               |
| instances          | 1m            | 0.03 / 0.03 / 1.17×               | 2.31 / n/d / —                    | 387 / 502                    | 5.10 / 3.95                    | 2 / 2                        | 248.7 / 72.5\*                 |
| instances          | 10k-moving    | 3.28 / 1.39 / 2.37×               | 0.64 / 0.40 / 1.61×               | 291 / 693                    | 3.77 / 1.66                    | 2 / 2                        | 28.2 / 0.7\*                   |
| instances          | 10k-functions | 0.08 ⚠ / 0.84 / 0.10×             | 0.79 ⚠ / 0.40 / 1.96×             | 830 ⚠ / 1123                 | 2.46 ⚠ / 1.04                  | 2 ⚠ / 2                      | 28.4 ⚠ / 0.7\*                 |
| unique-objects     | 1k            | 0.53 / 1.99 / 0.27×               | 1.02 / 0.71 / 1.44×               | 531 / 487                    | 3.11 / 2.34                    | 1001 / 1001                  | 37.0 / 14.7\*                  |
| point-lights       | 256           | não suportado (até F4) / 0.65 / — | não suportado (até F4) / n/d / —  | não suportado (até F4) / 16  | não suportado (até F4) / 65.53 | não suportado (até F4) / 202 | não suportado (até F4) / 0.0\* |
| skinned-characters | 500           | não suportado (até F8) / 3.03 / — | não suportado (até F8) / 1.77 / — | não suportado (até F8) / 322 | não suportado (até F8) / 3.55  | não suportado (até F8) / 501 | não suportado (até F8) / 0.9\* |
| rigid-bodies       | 1k            | 0.25 / 0.36 / 0.69×               | 2.04 / 0.36 / 5.74×               | 338 / 2493                   | 6.69 / 0.65                    | 3 / 3                        | 31.6 / 0.1\*                   |
| rigid-bodies       | 10k           | 0.13 / 27.01 / 0.00×              | 3.01 / 6.68 / 0.45×               | 280 / 36                     | 6.94 / 32.56                   | 3 / 3                        | 111.9 / 0.6\*                  |
| particles          | 4k            | 0.22 / 0.31 / 0.72×               | 2.21 / 0.47 / 4.67×               | 344 / 2880                   | 5.58 / 0.52                    | 2 / 2                        | 60.0 / 0.3\*                   |
| particles          | 64k           | 0.22 / 4.65 / 0.05×               | 13.75 / 3.14 / 4.38×              | 69 / 212                     | 29.32 / 5.03                   | 2 / 2                        | 66.2 / 3.9\*                   |
| particles          | 4k-water      | 0.32 / 0.34 ⚠ / 0.96×             | 3.46 / 0.45 ⚠ / 7.66×             | 230 / 2622 ⚠                 | 8.32 / 0.55 ⚠                  | 7 / 2 ⚠                      | 107.4 / 0.3 ⚠\*                |
| particles          | 64k-water     | 0.31 / 4.61 / 0.07×               | 20.91 / 3.14 / 6.67×              | 45 / 214                     | 53.97 / 4.97                   | 7 / 2                        | 113.6 / 3.9\*                  |
| particles          | 4k-cohesion   | 0.22 / 0.30 ⚠ / 0.74×             | 2.23 / 0.47 ⚠ / 4.72×             | 340 / 2887 ⚠                 | 5.63 / 0.52 ⚠                  | 2 / 2 ⚠                      | 60.0 / 0.3 ⚠\*                 |
| particles          | 64k-cohesion  | 0.23 / 4.63 / 0.05×               | 18.50 / 3.14 / 5.90×              | 51 / 213                     | 43.90 / 4.95                   | 2 / 2                        | 66.2 / 3.9\*                   |
| particles          | 64k-terrain   | 0.23 / 4.65 / 0.05×               | 15.61 / 3.14 / 4.98×              | 60 / 212                     | 38.81 / 5.03                   | 3 / 2                        | 69.8 / 3.9\*                   |
| surfaces           | wave-uniform  | 0.08 / 13.61 / 0.01×              | 1.36 / 0.62 / 2.20×               | 524 / 74                     | 4.20 / 15.47                   | 2 / 2                        | 28.2 / 3.5\*                   |
| surfaces           | wave-adaptive | 0.08 / 13.67 / 0.01×              | 1.32 / 0.62 / 2.14×               | 558 / 74                     | 4.00 / 15.46                   | 2 / 2                        | 38.0 / 3.5\*                   |
| graph-geometry     | static        | 0.04 / não suportado / —          | 0.68 / não suportado / —          | 984 / não suportado          | 1.93 / não suportado           | 2 / não suportado            | 85.2 / não suportado           |
| graph-geometry     | live          | 0.14 / não suportado / —          | 1.46 / não suportado / —          | 481 / não suportado          | 4.16 / não suportado           | 2 / não suportado            | 85.2 / não suportado           |

`×` = clayflow ÷ Three (> 1 = clayflow mais lento). `n/d` = indisponível. `*` = memória estimada. ⚠ = instável (CV > 5% entre repetições).
O resumo compara o custo efetivo por quadro: o maior entre intervalo médio de quadro, CPU e GPU.

## Resumo

- **instances / 10k**: clayflow mais lento (10.83×)
- **instances / 100k**: clayflow mais lento (2.81×)
- **instances / 1m**: clayflow mais lento (1.29×)
- **instances / 10k-moving**: clayflow mais lento (2.38×)
- **instances / 10k-functions**: clayflow mais lento (1.35×)
- **unique-objects / 1k**: equivalente (±10%)
- **point-lights / 256**: sem comparação (não suportado (até F4))
- **skinned-characters / 500**: sem comparação (não suportado (até F8))
- **rigid-bodies / 1k**: clayflow mais lento (7.37×)
- **rigid-bodies / 10k**: clayflow mais rápido (7.77×)
- **particles / 4k**: clayflow mais lento (6.16×)
- **particles / 64k**: clayflow mais lento (3.08×)
- **particles / 4k-water**: clayflow mais lento (9.62×)
- **particles / 64k-water**: clayflow mais lento (4.80×)
- **particles / 4k-cohesion**: clayflow mais lento (6.22×)
- **particles / 64k-cohesion**: clayflow mais lento (4.17×)
- **particles / 64k-terrain**: clayflow mais lento (3.55×)
- **surfaces / wave-uniform**: clayflow mais rápido (7.13×)
- **surfaces / wave-adaptive**: clayflow mais rápido (7.63×)
- **graph-geometry / static**: sem comparação (não suportado)
- **graph-geometry / live**: sem comparação (não suportado)

## Observações

- point-lights/256 (clayflow): não suportado — o forward ignora PointLight (até F4)
- skinned-characters/500 (clayflow): não suportado — sem skinning/animação (até F8)
- particles/64k-terrain (clayflow): limitado pela vsync — compare CPU/GPU por quadro.
- graph-geometry/static (three): não suportado — sem grafo de nós de geometria refeito na GPU; a referência de CPU dos nós está no smoke nodeGraphs
- graph-geometry/live (three): não suportado — sem grafo de nós de geometria refeito na GPU; a referência de CPU dos nós está no smoke nodeGraphs

## Limitações conhecidas do motor

- **instances / 10k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **instances / 100k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **instances / 1m** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **instances / 10k-moving** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **instances / 10k-functions** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **unique-objects / 1k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **rigid-bodies / 1k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **rigid-bodies / 10k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **particles / 4k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 4k** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **particles / 64k** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 64k** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **particles / 4k-water** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 4k-water** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **particles / 64k-water** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 64k-water** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **particles / 4k-cohesion** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 4k-cohesion** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **particles / 64k-cohesion** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 64k-cohesion** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **particles / 64k-terrain** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias); variantes _-water: o Three desenha as mesmas esferas (sem superfície de água): referência, não paridade; variante _-terrain: o Three desenha as mesmas esferas sobre o tanque (sem terreno colidível): referência
- **particles / 64k-terrain** (three): sem simulação de fluido: integração balística na CPU (referência de custo de desenho)
- **surfaces / wave-uniform** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **surfaces / wave-uniform** (three): onda na CPU (o Three não avalia superfícies na GPU); sem malha adaptativa: referência
- **surfaces / wave-adaptive** (clayflow): render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)
- **surfaces / wave-adaptive** (three): onda na CPU (o Three não avalia superfícies na GPU); sem malha adaptativa: referência
- **graph-geometry / static** (clayflow): render LDR 8 bits (HDR na F4)
- **graph-geometry / live** (clayflow): render LDR 8 bits (HDR na F4)

Resultados: bench/results/latest.json · latest.md (26.6 min)

# Gate de performance — REPROVADO

Perfil `apple-metal-3-chrome155-macos-1280x720-ifpfky` · baseline do commit fe1f188 · tolerância 10%

## Regressões

| Cena           | Variante      | Métrica     | Baseline | Atual | Δ       |
| -------------- | ------------- | ----------- | -------- | ----- | ------- |
| instances      | 10k           | cpuMs       | 0.03     | 0.05  | +66.7%  |
| instances      | 10k           | gpuMs       | 0.34     | 0.67  | +95.5%  |
| instances      | 10k           | frameMs.p95 | 0.88     | 1.80  | +105.1% |
| instances      | 10k           | frameMs.p99 | 0.99     | 1.97  | +98.0%  |
| instances      | 100k          | cpuMs       | 0.03     | 0.06  | +83.3%  |
| instances      | 100k          | gpuMs       | 0.35     | 0.98  | +179.3% |
| instances      | 100k          | frameMs.p95 | 1.02     | 4.00  | +294.1% |
| instances      | 100k          | frameMs.p99 | 1.26     | 4.62  | +268.3% |
| instances      | 1m            | cpuMs       | 0.03     | 0.03  | +16.7%  |
| instances      | 10k-moving    | cpuMs       | 2.92     | 3.28  | +12.3%  |
| instances      | 10k-moving    | gpuMs       | 0.32     | 0.64  | +101.7% |
| instances      | 10k-moving    | frameMs.p95 | 3.34     | 3.70  | +10.9%  |
| instances      | 10k-functions | cpuMs       | 0.04     | 0.08  | +100.0% |
| instances      | 10k-functions | gpuMs       | 0.49     | 0.79  | +60.4%  |
| instances      | 10k-functions | frameMs.p95 | 1.14     | 2.25  | +97.8%  |
| instances      | 10k-functions | frameMs.p99 | 1.54     | 2.46  | +59.9%  |
| unique-objects | 1k            | gpuMs       | 0.73     | 1.02  | +39.5%  |
| unique-objects | 1k            | frameMs.p95 | 2.13     | 2.96  | +39.1%  |
| unique-objects | 1k            | frameMs.p99 | 2.26     | 3.11  | +37.8%  |
| rigid-bodies   | 1k            | cpuMs       | 0.19     | 0.25  | +28.9%  |
| rigid-bodies   | 10k           | cpuMs       | 0.10     | 0.13  | +30.0%  |
| rigid-bodies   | 10k           | frameMs.p95 | 5.57     | 6.75  | +21.3%  |
| rigid-bodies   | 10k           | frameMs.p99 | 5.69     | 6.94  | +22.0%  |
| particles      | 4k            | cpuMs       | 0.19     | 0.22  | +15.8%  |
| particles      | 64k           | cpuMs       | 0.19     | 0.22  | +15.8%  |
| particles      | 4k-water      | cpuMs       | 0.28     | 0.32  | +14.0%  |
| particles      | 4k-water      | gpuMs       | 3.11     | 3.46  | +11.2%  |
| particles      | 4k-water      | frameMs.p99 | 7.56     | 8.32  | +10.1%  |
| particles      | 64k-water     | cpuMs       | 0.25     | 0.31  | +23.5%  |
| particles      | 64k-water     | gpuMs       | 15.63    | 20.91 | +33.8%  |
| particles      | 64k-water     | frameMs.p95 | 17.18    | 44.97 | +161.8% |
| particles      | 64k-water     | frameMs.p99 | 17.40    | 53.97 | +210.2% |
| particles      | 64k-cohesion  | cpuMs       | 0.20     | 0.23  | +17.5%  |
| particles      | 64k-cohesion  | gpuMs       | 16.66    | 18.50 | +11.0%  |
| particles      | 64k-cohesion  | frameMs.p95 | 34.19    | 39.77 | +16.3%  |
| particles      | 64k-cohesion  | frameMs.p99 | 34.42    | 43.90 | +27.5%  |
| particles      | 64k-terrain   | cpuMs       | 0.19     | 0.23  | +21.1%  |
| particles      | 64k-terrain   | frameMs.p95 | 29.11    | 33.99 | +16.7%  |
| particles      | 64k-terrain   | frameMs.p99 | 29.34    | 38.81 | +32.3%  |
| surfaces       | wave-uniform  | cpuMs       | 0.03     | 0.08  | +128.6% |
| surfaces       | wave-uniform  | gpuMs       | 0.45     | 1.36  | +204.2% |
| surfaces       | wave-uniform  | frameMs.p95 | 1.16     | 3.64  | +213.4% |
| surfaces       | wave-uniform  | frameMs.p99 | 1.35     | 4.20  | +210.7% |
| surfaces       | wave-adaptive | cpuMs       | 0.04     | 0.08  | +100.0% |
| surfaces       | wave-adaptive | gpuMs       | 0.54     | 1.32  | +144.4% |
| surfaces       | wave-adaptive | frameMs.p95 | 1.42     | 3.42  | +140.8% |
| surfaces       | wave-adaptive | frameMs.p99 | 1.60     | 4.00  | +149.8% |
