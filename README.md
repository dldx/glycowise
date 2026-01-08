# GlycoWise Recipe Analyzer

An intelligent nutritional tool that calculates the Glycemic Index (GI) and Glycemic Load (GL) of recipes from text descriptions or photos, providing ingredient swaps and method-based optimizations.

## Getting Started

1. Clone the repository.
2. Install dependencies:
   ```bash
   bun install
   ```
3. Start the development server:
   ```bash
   bun run dev
   ```
4. Open your browser and enter your Gemini API Key in the settings.

## Deployment

The site is configured for static hosting (e.g., GitHub Pages) using `@sveltejs/adapter-static`.

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
