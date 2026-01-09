<script lang="ts">
  import { scaleLinear } from 'd3-scale';
  import { line, curveBasis } from 'd3-shape';

  interface Props {
    gi: number;
    gl: number;
    synergy: number; // 0-10
  }

  let { gi, gl, synergy }: Props = $props();

  const generateCurve = () => {
    const points = [];
    const peakHeight = (gl * 2.5) * (1 - (synergy / 25));
    const peakTime = 45 + (synergy * 6);
    const curveWidth = 35 + (synergy * 12);

    for (let t = 0; t <= 180; t += 5) {
      const response = peakHeight * Math.exp(-Math.pow(t - peakTime, 2) / (2 * Math.pow(curveWidth, 2)));
      points.push({ time: t, value: response + 80 });
    }
    return points;
  };

  const dataPoints = $derived(generateCurve());
  const width = 300;
  const height = 150;
  const margin = { top: 10, right: 10, bottom: 40, left: 30 };

  const xScale = $derived(scaleLinear()
    .domain([0, 180])
    .range([margin.left, width - margin.right]));

  const yScale = $derived(scaleLinear()
    .domain([70, 180])
    .range([height - margin.bottom, margin.top]));

  const pathLine = $derived(line<{time: number, value: number}>()
    .x(d => xScale(d.time))
    .y(d => yScale(d.value))
    .curve(curveBasis));

  const pathData = $derived(pathLine(dataPoints));
</script>

<div class="flex flex-col bg-white shadow-sm p-4 border border-slate-100 rounded-2xl w-full h-64 overflow-hidden">
  <div class="flex justify-between items-center mb-4">
    <h4 class="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Blood Glucose Response</h4>
    <div class="flex items-center gap-1">
      <div class="bg-emerald-500 rounded-full w-2 h-2"></div>
      <span class="text-[9px] text-slate-500">Predicted Curve</span>
    </div>
  </div>

  <div class="relative flex-1 min-h-0">
    <svg viewBox="0 0 {width} {height}" class="w-full h-full preserve-3d" preserveAspectRatio="xMidYMid meet">
      <!-- Grid lines -->
      {#each [80, 120, 160] as y}
        <line
          x1={margin.left} y1={yScale(y)}
          x2={width - margin.right} y2={yScale(y)}
          stroke="#f1f5f9"
          stroke-width="1"
        />
        <text
          x={margin.left - 5}
          y={yScale(y)}
          text-anchor="end"
          alignment-baseline="middle"
          class="fill-slate-400 font-medium text-[8px]"
        >{y}</text>
      {/each}

      <!-- X Axis Ticks -->
      {#each [0, 60, 120, 180] as xVal}
        <text
          x={xScale(xVal)}
          y={height - 15}
          text-anchor="middle"
          class="fill-slate-400 font-medium text-[8px]"
        >{xVal}m</text>
      {/each}

      <!-- Baseline -->
      <line
        x1={margin.left} y1={yScale(80)}
        x2={width - margin.right} y2={yScale(80)}
        stroke="#e2e8f0"
        stroke-dasharray="4"
      />

      <!-- The Curve -->
      {#if pathData}
        <path
          d={pathData}
          fill="none"
          stroke="url(#gl-gradient)"
          stroke-width="3"
          stroke-linecap="round"
        />
      {/if}

      <defs>
        <linearGradient id="gl-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="50%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#10b981" />
        </linearGradient>
      </defs>
    </svg>
  </div>

  <p class="mt-2 text-[8px] text-slate-400 text-center italic">
    * Based on {gl} GL and {synergy}/10 synergy blunting.
  </p>
</div>
