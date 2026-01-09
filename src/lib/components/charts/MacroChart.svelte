<script lang="ts">
  import Tooltip from '../ui/tooltip.svelte';

  interface Props {
    protein: number;
    fat: number;
    fibre: number;
    carbs: number;
  }

  let { protein, fat, fibre, carbs }: Props = $props();

  const total = $derived(protein + fat + fibre + carbs || 1);
  const data = $derived([
    { label: 'Protein', value: (protein / total) * 100, color: '#60a5fa', amount: protein },
    { label: 'Fat', value: (fat / total) * 100, color: '#fbbf24', amount: fat },
    { label: 'Fibre', value: (fibre / total) * 100, color: '#10b981', amount: fibre },
    { label: 'Carbs', value: (carbs / total) * 100, color: '#f87171', amount: carbs }
  ]);

</script>

<div class="flex flex-col bg-white shadow-sm p-4 border border-slate-100 rounded-2xl w-full h-64 overflow-hidden">
  <h4 class="mb-4 font-bold text-[10px] text-slate-400 uppercase tracking-widest">Macro Distribution (%)</h4>

  <div class="flex flex-1 items-stretch gap-8 pt-2 min-h-0">
    <!-- Vertical Stacked Bar -->
    <div class="flex flex-col-reverse bg-slate-50 border border-slate-100 rounded-xl w-12 overflow-hidden shrink-0">
      {#each data as item}
        {#if item.value > 0}
          <Tooltip style="height: {item.value}%; width: 100%; display: block;">
            {#snippet children()}
              <div
                class="hover:opacity-80 w-full h-full transition-all duration-700 ease-out cursor-help"
                style="background-color: {item.color}"
              ></div>
            {/snippet}
            {#snippet content()}
              <div class="flex flex-col gap-1">
                <span class="font-bold">{item.label}</span>
                <span class="text-slate-200">{item.amount.toFixed(1)}g ({item.value.toFixed(1)}%)</span>
              </div>
            {/snippet}
          </Tooltip>
        {/if}
      {/each}
    </div>

    <!-- Labels -->
    <div class="flex flex-col flex-1 justify-around">
      {#each [...data].reverse() as item}
        <Tooltip class="-m-1 p-1">
          {#snippet children()}
            <div class="group flex items-center gap-3 cursor-help">
              <div class="rounded-full w-2.5 h-2.5 group-hover:scale-125 transition-transform shrink-0" style="background-color: {item.color}"></div>
              <div class="flex flex-col">
                <span class="font-bold text-[11px] text-slate-700 leading-tight">{item.label}</span>
                <span class="font-medium text-[10px] text-slate-400 leading-tight">{item.value.toFixed(1)}%</span>
              </div>
            </div>
          {/snippet}
          {#snippet content()}
            <div class="flex flex-col gap-1">
              <span class="font-bold">{item.label}</span>
              <span class="text-slate-200">{item.amount.toFixed(1)}g total</span>
            </div>
          {/snippet}
        </Tooltip>
      {/each}
    </div>
  </div>
</div>
