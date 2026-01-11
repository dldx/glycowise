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

<div class="flex flex-col bg-white shadow-sm p-4 border border-slate-100 rounded-2xl w-full h-full overflow-hidden">
  <div class="flex justify-between items-center mb-4">
    <div class="flex items-center gap-2">
      <h4 class="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Macro Distribution (%)</h4>
      <Tooltip>
        {#snippet children()}
          <i class="text-slate-300 text-xs cursor-help fas fa-circle-info"></i>
        {/snippet}
        {#snippet content()}
          <div class="max-w-xs text-[10px]">
            <p class="mb-1 font-bold">Macronutrient Balance:</p>
            <p>Shows the weight-based distribution of main nutrients. For glycaemic health, a significant presence of protein, fat, and especially fibre is desired to slow the absorption of carbohydrates (the 'blunting' effect).</p>
          </div>
        {/snippet}
      </Tooltip>
    </div>
  </div>

  <div class="flex flex-1 justify-center items-center gap-6 pt-2 min-h-0">
    <!-- Vertical Stacked Bar -->
    <div class="flex flex-col-reverse bg-slate-50 border border-slate-100 rounded-xl w-14 h-40 overflow-hidden shrink-0">
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
    <div class="flex flex-col justify-center gap-3">
      {#each [...data].reverse() as item}
        <Tooltip class="-m-1 p-1">
          {#snippet children()}
            <div class="group flex items-center gap-3 hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-help">
              <div class="shadow-sm rounded-full w-3 h-3 group-hover:scale-110 transition-transform shrink-0" style="background-color: {item.color}"></div>
              <div class="flex flex-col">
                <span class="mb-1 font-bold text-slate-700 text-xs leading-none">{item.label}</span>
                <span class="font-medium text-[10px] text-slate-400 leading-none">{item.value.toFixed(1)}%</span>
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
