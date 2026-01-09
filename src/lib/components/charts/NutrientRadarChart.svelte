<script lang="ts">
  import { onMount } from 'svelte';
  import Tooltip from '../ui/tooltip.svelte';

  interface Props {
    gl: number;
    fiber: number;
    protein: number;
    sodiumPotassiumRatio: number;
    saturatedFatPercent: number;
  }

  let { gl, fiber, protein, sodiumPotassiumRatio, saturatedFatPercent }: Props = $props();

  const axes = [
    { label: ['Glycaemic', 'Load'], key: 'gl' },
    { label: ['Fibre'], key: 'fiber' },
    { label: ['Protein'], key: 'protein' },
    { label: ['Sodium:', 'Potassium'], key: 'nak' },
    { label: ['Saturated', 'Fat'], key: 'satfat' }
  ];

  // Normalization logic to make "bigger = better"
  const normalize = (val: number, type: string) => {
    switch (type) {
      case 'gl':
        // Low GL is better. 0-5 is low, 20+ is high.
        return Math.max(0, Math.min(1, 1 - (val / 25)));
      case 'fiber':
        // More fibre is better. 10g+ is good for a meal.
        return Math.max(0, Math.min(1, val / 12));
      case 'protein':
        // Sufficient protein is good. 25g+ is good.
        return Math.max(0, Math.min(1, val / 30));
      case 'nak':
        // Low Na:K is better. 1.0 is target, 3.0+ is poor.
        return Math.max(0, Math.min(1, 1.5 - (val / 2)));
      case 'satfat':
        // Low sat fat is better. <10% is target, 20%+ is high.
        return Math.max(0, Math.min(1, 1 - (val / 20)));
      default:
        return 0.5;
    }
  };

  const values = $derived([
    normalize(gl, 'gl'),
    normalize(fiber, 'fiber'),
    normalize(protein, 'protein'),
    normalize(sodiumPotassiumRatio, 'nak'),
    normalize(saturatedFatPercent, 'satfat')
  ]);

  const size = 320;
  const center = size / 2;
  const radius = 85;

  const points = $derived(values.map((v, i) => {
    const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
    return {
      x: center + radius * v * Math.cos(angle),
      y: center + radius * v * Math.sin(angle),
      labelX: center + (radius + 20) * Math.cos(angle),
      labelY: center + (radius + 20) * Math.sin(angle),
      angle
    };
  }));

  const polygonPath = $derived(points.map(p => `${p.x},${p.y}`).join(' '));

  const gridCircles = [0.2, 0.4, 0.6, 0.8, 1];
</script>

<div class="flex flex-col bg-white shadow-sm p-4 border border-slate-100 rounded-2xl w-full h-72">
  <div class="flex justify-between items-center mb-2">
    <h4 class="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Nutrient Profile (Radar)</h4>
    <Tooltip>
      {#snippet children()}
        <i class="text-slate-300 text-xs cursor-help fas fa-circle-info"></i>
      {/snippet}
      {#snippet content()}
        <div class="max-w-xs text-[10px]">
          <p class="mb-1 font-bold">How to read:</p>
          <p>A large, balanced shape indicates a heart-healthy, diabetic-friendly meal. Lopsided spikes towards any corner indicate potential nutritional imbalances.</p>
        </div>
      {/snippet}
    </Tooltip>
  </div>

  <div class="relative flex flex-1 justify-center items-center">
    <svg viewBox="0 0 {size} {size}" class="w-full max-w-60 h-full">
      <!-- Grid -->
      {#each gridCircles as circle}
        <polygon
          points={axes.map((_, i) => {
            const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
            const r = radius * circle;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(' ')}
          fill="none"
          stroke="#f1f5f9"
          stroke-width="1"
        />
      {/each}

      <!-- Axes Lines -->
      {#each axes as _, i}
        {@const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2}
        <line
          x1={center}
          y1={center}
          x2={center + radius * Math.cos(angle)}
          y2={center + radius * Math.sin(angle)}
          stroke="#f1f5f9"
          stroke-width="1"
        />
      {/each}

      <!-- Data Shape -->
      <polygon
        points={polygonPath}
        fill="rgba(16, 185, 129, 0.2)"
        stroke="#10b981"
        stroke-width="2"
        stroke-linejoin="round"
        class="transition-all duration-1000 ease-out"
      />

      <!-- Data Points -->
      {#each points as point, i}
        <circle
          cx={point.x}
          cy={point.y}
          r="3"
          fill="#10b981"
          class="transition-all duration-1000 ease-out"
        />
      {/each}

      <!-- Labels -->
      {#each points as point, i}
        <text
          x={point.labelX}
          y={point.labelY}
          text-anchor={Math.cos(point.angle) > 0.1 ? 'start' : Math.cos(point.angle) < -0.1 ? 'end' : 'middle'}
          class="fill-slate-500 font-extrabold text-[10px]"
        >
          {#each axes[i].label as line, lineIdx}
            <tspan
              x={point.labelX}
              dy={lineIdx === 0 
                ? (axes[i].label.length > 1 ? "-.4em" : ".35em") 
                : "1.1em"}
            >
              {line}
            </tspan>
          {/each}
        </text>
      {/each}
    </svg>
  </div>
</div>

<style>
  polygon {
    transition: points 0.6s ease-out;
  }
</style>
