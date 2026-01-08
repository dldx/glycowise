<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "$lib/utils";
	import { fly } from "svelte/transition";

	let {
		children,
		content,
		class: className = undefined,
		...rest
	} = $props();
</script>

<TooltipPrimitive.Root delayDuration={200}>
	<TooltipPrimitive.Trigger
		class={cn("inline-flex justify-center items-center", className)}
		{...rest}
	>
		{@render children()}
	</TooltipPrimitive.Trigger>
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content
			sideOffset={8}
			class="data-[side=left]:slide-in-from-right-2 data-[side=top]:slide-in-from-bottom-2 z-50 bg-slate-800 data-[side=bottom]:slide-in-from-top-2 data-[side=right]:slide-in-from-left-2 shadow-xl px-3 py-2 rounded-xl w-64 overflow-hidden text-[11px] text-white animate-in fade-in zoom-in-95"
		>
			<TooltipPrimitive.Arrow class="fill-slate-800" />
			{@render content()}
		</TooltipPrimitive.Content>
	</TooltipPrimitive.Portal>
</TooltipPrimitive.Root>
