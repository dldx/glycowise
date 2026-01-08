import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '.', '');
	return {
		plugins: [
			sveltekit(),
			tailwindcss(),
			SvelteKitPWA({
				registerType: 'autoUpdate',
				manifest: {
					name: 'GlycoWise - Recipe Analyzer',
					short_name: 'GlycoWise',
					description: 'Intelligent Glycemic Index & Load Analysis powered by Gemini 3 Flash',
					theme_color: '#10b981',
					background_color: '#f8fafc',
					display: 'standalone',
					icons: [
						{
							src: 'favicon.svg',
							sizes: 'any',
							type: 'image/svg+xml',
							purpose: 'any'
						},
						{
							src: 'favicon.svg',
							sizes: '512x512',
							type: 'image/svg+xml',
							purpose: 'maskable'
						}
					]
				}
			})
		],
		define: {
			'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
			'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
		}
	};
});
