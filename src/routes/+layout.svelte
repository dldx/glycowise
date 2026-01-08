<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	let { children } = $props();

	onMount(async () => {
		if ('serviceWorker' in navigator && import.meta.env.PROD) {
			const { registerSW } = await import('virtual:pwa-register');
			registerSW({
				immediate: true,
				onRegistered(r) {
					console.log('SW registered');
				},
				onRegisterError(error) {
					console.log('SW registration error', error);
				}
			});
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="{base}/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="{base}/favicon.svg" />
</svelte:head>
{@render children()}
