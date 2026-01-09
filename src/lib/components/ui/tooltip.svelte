<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils";
	import { fly } from "svelte/transition";
	import { onMount } from "svelte";

	let {
		children,
		content,
		class: className = undefined,
		...rest
	} = $props();

	let open = $state(false);
	let isTouch = $state(false);

	onMount(() => {
		isTouch = window.matchMedia('(pointer: coarse)').matches;
	});

	function handleTriggerClick(e: MouseEvent | PointerEvent) {
		if (isTouch) {
			e.preventDefault();
			e.stopPropagation();
			open = !open;
		}
	}
</script>

<TooltipPrimitive.Root bind:open delayDuration={isTouch ? 0 : 200}>
	<TooltipPrimitive.Trigger
		class={cn("inline-flex justify-center items-center min-w-[24px] min-h-[24px] touch-manipulation cursor-help", className)}
		onclick={handleTriggerClick}
		onpointerdown={(e) => {
			if (isTouch) {
				e.stopPropagation();
				// Don't preventDefault here as it might stop the click event
			}
		}}
		{...rest}
	>
		{@render children()}
	</TooltipPrimitive.Trigger>
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content
			sideOffset={8}
			class="data-[side=left]:slide-in-from-right-2 data-[side=top]:slide-in-from-bottom-2 z-50 bg-slate-800 data-[side=bottom]:slide-in-from-top-2 data-[side=right]:slide-in-from-left-2 shadow-xl px-3 py-4 rounded-xl w-64 overflow-hidden text-[11px] text-white animate-in fade-in zoom-in-95"
		>
			<TooltipPrimitive.Arrow class="fill-slate-800" />
			<div class="relative">
				{@render content()}
				{#if isTouch}
					<button
						class="bg-slate-700 hover:bg-slate-600 mt-3 py-2 rounded-lg w-full font-bold text-[10px] uppercase tracking-wider transition-colors"
						onclick={() => open = false}
					>
						Close
					</button>
				{/if}
			</div>
		</TooltipPrimitive.Content>
	</TooltipPrimitive.Portal>
</TooltipPrimitive.Root>
