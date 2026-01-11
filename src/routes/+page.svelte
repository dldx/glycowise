<script lang="ts">
  import { onMount } from 'svelte';
  import { analyseRecipe, startRecipeChat } from '$lib/geminiService';
  import { AnalysisStatus } from '$lib/types';
  import type { RecipeAnalysis, ChatMessage } from '$lib/types';
  import { dbService } from '$lib/dbService.svelte';
  import { usageService } from '$lib/usageService.svelte';
  import { historyService } from '$lib/historyService.svelte';
  import type { Chat } from "@google/genai";
  import SvelteMarkdown from 'svelte-markdown';
  import Tooltip from '$lib/components/ui/tooltip.svelte';
  import GlycaemicChart from '$lib/components/charts/GlycaemicChart.svelte';
  import MacroChart from '$lib/components/charts/MacroChart.svelte';
  import NutrientRadarChart from '$lib/components/charts/NutrientRadarChart.svelte';

  let recipeText = $state('');
  let image = $state<string | null>(null);
  let status = $state(AnalysisStatus.IDLE);
  let analysis = $state<RecipeAnalysis | null>(null);
  let error = $state<string | null>(null);

  const macroTotals = $derived.by(() => {
    if (!analysis) return { protein: 0, fat: 0, fibre: 0, carbs: 0 };
    return analysis.ingredients.reduce((acc, ing) => {
      acc.protein += ing.protein || 0;
      acc.fat += ing.fat || 0;
      acc.fibre += ing.fibre || 0;
      acc.carbs += ing.netCarbs || 0;
      return acc;
    }, { protein: 0, fat: 0, fibre: 0, carbs: 0 });
  });

  onMount(() => {
    dbService.loadDatabases();
  });

  // Chat States
  let chatSession = $state<Chat | null>(null);
  let chatHistory = $state<ChatMessage[]>([]);
  let chatInput = $state('');
  let isChatting = $state(false);
  let chatEndRef: HTMLDivElement | undefined = $state();
  let resultsRef: HTMLDivElement | undefined = $state();

  let showApiKeyPrompt = $state(false);
  let tempApiKey = $state('');

  // Camera States
  let isCameraActive = $state(false);
  let videoElement: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;

  onMount(() => {
    const key = localStorage.getItem('gemini_api_key');
    if (!key) {
      showApiKeyPrompt = true;
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  });

  const saveApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem('gemini_api_key', tempApiKey.trim());
      showApiKeyPrompt = false;
      tempApiKey = '';
    }
  };

  const startCamera = async () => {
    try {
      error = null;
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      isCameraActive = true;
      // We need a tick for the video element to be available or just use $effect
    } catch (err) {
      console.error("Camera error:", err);
      error = "Could not access camera. Please check permissions.";
    }
  };

  $effect(() => {
    if (isCameraActive && videoElement && stream) {
      videoElement.srcObject = stream;
    }
  });

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    isCameraActive = false;
  };

  const capturePhoto = () => {
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoElement, 0, 0);
      image = canvas.toDataURL('image/jpeg');
      stopCamera();
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      image = base64;
    }
  };

  const handleAnalyse = async () => {
    if (!recipeText && !image) {
      error = "Please provide a recipe description or a photo.";
      return;
    }

    status = AnalysisStatus.LOADING;
    error = null;
    chatHistory = [];
    analysis = null;

    try {
      // Check Cache
      const cached = await historyService.getCachedAnalysis(recipeText, image);
      if (cached) {
        analysis = cached;
        const session = startRecipeChat(cached);
        chatSession = session;
        status = AnalysisStatus.SUCCESS;
        return;
      }

      const result = await analyseRecipe(recipeText || "Analyse this dish", image || undefined);
      analysis = result;

      // Save to History
      await historyService.saveEntry(recipeText, image, result);

      const session = startRecipeChat(result);
      chatSession = session;
      status = AnalysisStatus.SUCCESS;
    } catch (err) {
      console.error(err);
      error = "Failed to analyse the recipe. Please try again.";
      status = AnalysisStatus.ERROR;
    }
  };

  const loadFromHistory = (entry: any) => {
    recipeText = entry.input.text;
    image = entry.input.image;
    analysis = entry.analysis;
    const session = startRecipeChat(entry.analysis);
    chatSession = session;
    chatHistory = [];
    status = AnalysisStatus.SUCCESS;
  };

  const handleSendMessage = async (e?: Event) => {
    e?.preventDefault();
    if (!chatInput.trim() || !chatSession || isChatting) return;

    const userMessage = chatInput.trim();
    chatInput = '';
    chatHistory = [...chatHistory, { role: 'user', text: userMessage }];
    isChatting = true;

    try {
      const result = await chatSession.sendMessageStream({ message: userMessage });
      let fullResponse = '';

      chatHistory = [...chatHistory, { role: 'model', text: '' }];

      for await (const chunk of result) {
        fullResponse += chunk.text;
        const newHistory = [...chatHistory];
        newHistory[newHistory.length - 1].text = fullResponse;
        chatHistory = newHistory;
      }

      // Record usage after stream ends
      // In @google/genai, usageMetadata is often available on the result object after iteration
      const usageMetadata = (result as any).usageMetadata;
      if (usageMetadata) {
        const usage = usageService.recordUsage(
          usageMetadata.promptTokenCount || 0,
          usageMetadata.candidatesTokenCount || 0
        );
        chatHistory[chatHistory.length - 1].usage = usage;
      }
    } catch (err) {
      console.error(err);
      error = "Failed to send message.";
    } finally {
      isChatting = false;
    }
  };

  $effect(() => {
    if (chatHistory.length > 0 || isChatting) {
      chatEndRef?.scrollIntoView({ behavior: "smooth" });
    }
  });

  $effect(() => {
    if (status === AnalysisStatus.SUCCESS && resultsRef) {
      resultsRef.scrollIntoView({ behavior: "smooth", block: 'start' });
    }
  });
</script>

<div class="bg-linear-to-br from-emerald-50 via-white to-sky-50 p-3 md:p-6 min-h-screen">
  <div class="mx-auto max-w-6xl">
    {#if !dbService.isLoaded}
      <div class="z-50 fixed inset-0 flex flex-col justify-center items-center bg-white/90 backdrop-blur-sm p-6 text-center">
        <div class="inline-flex justify-center items-center bg-white shadow-sm mb-8 p-3 rounded-2xl">
          <i class="mr-3 text-emerald-500 text-3xl fas fa-leaf"></i>
          <h1 class="bg-clip-text bg-linear-to-r from-emerald-600 to-sky-600 font-bold text-transparent text-3xl">
            GlycoWise
          </h1>
        </div>

        <div class="mb-4 w-full max-w-md">
          <div class="flex justify-between mb-2">
            <span class="font-bold text-slate-600 text-xs uppercase tracking-widest">{dbService.loadingStatus}</span>
            <span class="font-bold text-emerald-600 text-xs">{dbService.progress}%</span>
          </div>
          <div class="bg-slate-100 rounded-full w-full h-3 overflow-hidden">
            <div
              class="bg-linear-to-r from-emerald-500 to-sky-500 h-full transition-all duration-300"
              style="width: {dbService.progress}%"
            ></div>
          </div>
        </div>
        <p class="text-slate-400 text-xs">Initializing nutritional databases for precision analysis...</p>
      </div>
    {/if}

    <!-- Header -->
    <header class="relative mb-8 text-center">
      <div class="top-0 right-0 absolute flex items-center gap-2">
        {#if usageService.totalCost > 0}
          <div class="flex flex-col items-end mr-4">
            <span class="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Session Cost</span>
            <span class="font-mono font-bold text-emerald-600 text-sm">${usageService.totalCost.toFixed(4)}</span>
          </div>
        {/if}
        <button
          onclick={() => showApiKeyPrompt = true}
          class="flex flex-col items-center p-2 text-slate-400 hover:text-emerald-500 transition-colors"
        >
          <i class="text-xl fas fa-key"></i>
          <span class="mt-1 font-bold text-[10px] uppercase tracking-wider">API Key</span>
        </button>
      </div>
      <div class="inline-flex justify-center items-center bg-white shadow-sm mb-3 p-2.5 rounded-2xl">
        <i class="mr-3 text-emerald-500 text-2xl fas fa-leaf"></i>
        <h1 class="bg-clip-text bg-linear-to-r from-emerald-600 to-sky-600 font-bold text-transparent text-2xl">
          GlycoWise
        </h1>
      </div>
      <p class="text-slate-600 text-base">Intelligent Glycaemic Index & Load Analysis</p>
      <p class="mt-1 font-medium text-emerald-600 text-xs uppercase tracking-widest">Powered by Gemini 3 Flash (Preview)</p>
      <div class="mx-auto mt-6 max-w-2xl">
        <p class="bg-emerald-50/50 shadow-sm p-4 border border-emerald-100/50 rounded-2xl text-slate-600 text-sm leading-relaxed">
          GlycoWise provides data-driven insights into the glycaemic impact of your meals. By cross-referencing ingredients with clinical database records, we estimate Glycaemic Index and Load to help you manage blood glucose levels effectively.
        </p>
      </div>
    </header>

    <div class="items-start gap-6 grid grid-cols-1 lg:grid-cols-2">
      <!-- Input Section -->
      <section class="shadow-xl p-5 border border-white/50 rounded-3xl glass">
        <div class="flex items-center mb-5">
          <div class="flex justify-center items-center bg-emerald-100 mr-4 rounded-xl w-9 h-9">
            <i class="text-emerald-600 fas fa-utensils"></i>
          </div>
          <h2 class="font-bold text-slate-800 text-lg">New Analysis</h2>
        </div>

        <div class="space-y-5">
          <div>
            <label for="recipe" class="block mb-2 font-semibold text-slate-700 text-sm">
              Recipe Description or Ingredients
            </label>
            <textarea
              id="recipe"
              class="bg-white/50 p-4 border border-slate-200 focus:border-transparent rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 w-full h-36 placeholder:text-slate-400 transition-all resize-none"
              placeholder="Example: 100g of cooked white rice with two grilled chicken breasts and steamed broccoli..."
              bind:value={recipeText}
            ></textarea>
          </div>

          <div class="group relative">
            <label for="foodPhoto" class="block mb-2 font-semibold text-slate-700 text-sm">
              Food Photo (Optional)
            </label>
            <div id="foodPhoto" class="relative flex flex-col justify-center items-center bg-white/30 border-2 border-slate-300 border-dashed rounded-2xl w-full h-44 overflow-hidden transition-all">
              {#if image}
                <img src={image} alt="Preview" class="w-full h-full object-cover" />
                <button
                  onclick={() => { image = null; stopCamera(); }}
                  aria-label="Remove photo"
                  class="top-2 right-2 z-10 absolute flex justify-center items-center bg-rose-500 hover:bg-rose-600 shadow-lg rounded-full w-7 h-7 text-white transition-colors"
                >
                  <i class="text-xs fas fa-times"></i>
                </button>
              {:else if isCameraActive}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                  bind:this={videoElement}
                  autoplay
                  playsinline
                  class="bg-black w-full h-full object-cover"
                ></video>
                <div class="right-0 bottom-3 left-0 absolute flex justify-center gap-3 px-4">
                  <button
                    onclick={capturePhoto}
                    class="bg-emerald-500 hover:bg-emerald-600 shadow-lg px-5 py-2 rounded-xl font-bold text-white text-xs transition-all"
                  >
                    <i class="mr-2 fas fa-camera"></i> Capture
                  </button>
                  <button
                    onclick={stopCamera}
                    class="bg-slate-800/80 hover:bg-slate-900 shadow-lg backdrop-blur-md px-5 py-2 rounded-xl font-bold text-white text-xs transition-all"
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <div class="flex flex-col items-center gap-3 py-4">
                   <div class="flex gap-8">
                      <label class="group/btn flex flex-col items-center cursor-pointer">
                        <div class="bg-white/80 group-hover/btn:bg-white shadow-sm mb-2 p-3 border border-transparent group-hover/btn:border-emerald-100 rounded-2xl text-emerald-500 group-hover/btn:scale-110 transition-all">
                          <i class="text-lg fas fa-image"></i>
                        </div>
                        <span class="font-bold text-[11px] text-slate-500 uppercase tracking-wide">Gallery</span>
                        <input type="file" class="hidden" accept="image/*" onchange={handleImageChange} />
                      </label>

                      <button
                        onclick={startCamera}
                        class="group/btn flex flex-col items-center"
                      >
                        <div class="bg-white/80 group-hover/btn:bg-white shadow-sm mb-2 p-3 border border-transparent group-hover/btn:border-emerald-100 rounded-2xl text-emerald-500 group-hover/btn:scale-110 transition-all">
                          <i class="text-lg fas fa-camera"></i>
                        </div>
                        <span class="font-bold text-[11px] text-slate-500 uppercase tracking-wide">Camera</span>
                      </button>
                   </div>
                   <p class="font-medium text-[10px] text-slate-400">Use AI to identify ingredients from a photo</p>
                </div>
              {/if}
            </div>
          </div>

          <button
            onclick={handleAnalyse}
            disabled={status === AnalysisStatus.LOADING || !dbService.isLoaded}
            class="bg-linear-to-r from-emerald-500 to-emerald-600 disabled:opacity-50 shadow-emerald-200 shadow-lg hover:shadow-emerald-300 py-3.5 rounded-2xl w-full font-bold text-white text-sm disabled:transform-none transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed"
          >
            {#if status === AnalysisStatus.LOADING}
              <i class="mr-2 fas fa-spinner fa-spin"></i> Analysing...
            {:else if !dbService.isLoaded}
              <i class="mr-2 fas fa-database"></i> Loading Databases...
            {:else}
              <i class="mr-2 fas fa-wand-magic-sparkles"></i> Generate Smart Analysis
            {/if}
          </button>

          {#if error}
            <div class="flex items-start bg-rose-50 p-4 border border-rose-100 rounded-xl">
              <i class="mt-1 mr-3 text-rose-500 fas fa-circle-exclamation"></i>
              <p class="text-rose-700 text-sm">{error}</p>
            </div>
          {/if}
        </div>

        <!-- History Section -->
        {#if historyService.entries.length > 0}
          <div class="mt-8 pt-6 border-slate-100 border-t">
            <div class="flex justify-between items-center mb-4">
              <h3 class="font-bold text-slate-700 text-sm uppercase tracking-wider">Recent Analysis History</h3>
              <button
                onclick={() => historyService.clearHistory()}
                class="font-bold text-[10px] text-slate-400 hover:text-rose-500 uppercase transition-colors"
              >
                Clear All
              </button>
            </div>
            <div class="space-y-2 pr-2 max-h-60 overflow-y-auto custom-scrollbar">
              {#each historyService.entries as entry}
                <button
                  onclick={() => loadFromHistory(entry)}
                  class="group flex items-center bg-white/40 hover:bg-emerald-50 p-3 border border-slate-100 rounded-xl w-full text-left transition-all"
                >
                  <div class="flex justify-center items-center bg-emerald-100 mr-3 rounded-lg w-8 h-8 shrink-0">
                    {#if entry.input.image}
                      <img src={entry.input.image} alt="" class="rounded-lg w-full h-full object-cover" />
                    {:else}
                      <i class="text-emerald-500 text-xs fas fa-history"></i>
                    {/if}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center">
                      <p class="font-bold text-slate-700 text-xs truncate">{entry.recipeName}</p>
                      <span class="ml-2 text-[9px] text-slate-400 shrink-0">
                        {new Date(entry.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p class="text-[10px] text-slate-400 truncate">{entry.input.text || 'Photo Analysis'}</p>
                  </div>
                  <i class="fa-chevron-right opacity-0 group-hover:opacity-100 ml-2 text-emerald-400 text-xs transition-all fas"></i>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <!-- Results Section -->
      <section class="space-y-6">
        {#if status === AnalysisStatus.SUCCESS && analysis}
          <div bind:this={resultsRef} class="slide-in-from-bottom-4 shadow-xl p-5 border border-white/50 rounded-3xl animate-in duration-500 glass fade-in">
            <div class="flex justify-between items-start mb-5">
              <h2 class="flex items-center font-bold text-slate-800 text-xl">
                <span class="bg-emerald-500 mr-4 rounded-full w-2 h-7"></span>
                Analysis for: {analysis.recipeName}
              </h2>
              {#if analysis.usage}
                <div class="bg-slate-100/50 px-3 py-1 rounded-full text-[10px] text-slate-400">
                  <i class="mr-1 fas fa-microchip"></i>
                  ${analysis.usage.estimatedCost.toFixed(4)} ({analysis.usage.totalTokens} tokens)
                </div>
              {/if}
            </div>

            <!-- Scientific Pillars Grid -->
            <div class="gap-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 mb-6">
              <!-- Pillar 1: GL -->
              <div class="bg-white shadow-sm p-3 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                  1. Glycaemic Load
                  <Tooltip class="-m-1.5 p-1.5">
                    {#snippet children()}
                      <i class="text-slate-400 hover:text-emerald-500 fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Glycaemic Load (GL)</p>
                      <p class="font-normal text-xs">Measures the total glycaemic impact per serving. Low &lt; 10, Medium 11-19, High 20+.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="font-bold text-slate-800 text-xl">{analysis.healthMetrics.glycaemicLoad}</div>
                <div class="mt-1">
                  <span class="px-1.5 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider {analysis.glCategory === 'Low' ? 'bg-emerald-100 text-emerald-700' : analysis.glCategory === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}">
                    {analysis.glCategory}
                  </span>
                </div>
              </div>

              <!-- Pillar 2: Synergy -->
              <div class="bg-white shadow-sm p-3 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                  2. Synergy
                  <Tooltip class="-m-1.5 p-1.5">
                    {#snippet children()}
                      <i class="text-slate-400 hover:text-emerald-500 fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Macronutrient Synergy</p>
                      <p class="font-normal text-xs">Score (0-10) of how well protein, fat, and fibre "blunt" the glucose spike from carbs.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="font-bold text-slate-800 text-xl">{analysis.healthMetrics.macronutrientSynergy}/10</div>
                <div class="mt-1">
                  <div class="bg-slate-100 rounded-full w-full h-1">
                    <div class="bg-emerald-500 rounded-full h-full" style="width: {analysis.healthMetrics.macronutrientSynergy * 10}%"></div>
                  </div>
                </div>
              </div>

              <!-- Pillar 3: Lipids -->
              <div class="bg-white shadow-sm p-3 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                  3. Lipid Ratio
                  <Tooltip class="-m-1.5 p-1.5">
                    {#snippet children()}
                      <i class="text-slate-400 hover:text-emerald-500 fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Unsat:Sat Ratio</p>
                      <p class="font-normal text-xs">Heart health metric. Goal is a high ratio of unsaturated to saturated fats.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="font-bold text-slate-800 text-xl">{analysis.healthMetrics.lipidProfileRatio.toFixed(1)}</div>
                <div class="mt-1">
                   <span class="font-bold text-[9px] text-slate-500 uppercase tracking-tight">Unsat : Sat</span>
                </div>
              </div>

              <!-- Pillar 4: Soluble Fibre -->
              <div class="bg-white shadow-sm p-3 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                  4. Soluble Fibre
                  <Tooltip class="-m-1.5 p-1.5">
                    {#snippet children()}
                      <i class="text-slate-400 hover:text-emerald-500 fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Soluble Fibre</p>
                      <p class="font-normal text-xs">Form gels in the gut to slow sugar absorption and feed beneficial microbiome.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="font-bold text-slate-800 text-xl">{analysis.healthMetrics.solubleFibreContent}g</div>
                <div class="mt-1">
                  <span class="font-bold text-[9px] text-emerald-600 uppercase tracking-tight">Gut Health Factor</span>
                </div>
              </div>

              <!-- Pillar 5: Na:K Ratio -->
              <div class="bg-white shadow-sm p-3 border border-slate-100 rounded-2xl">
                <div class="flex justify-between items-center mb-1 font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                  5. Na : K Balance
                  <Tooltip class="-m-1.5 p-1.5">
                    {#snippet children()}
                      <i class="text-slate-400 hover:text-emerald-500 fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Sodium to Potassium Ratio</p>
                      <p class="font-normal text-xs">Goal is &lt; 1.0. High potassium relative to sodium protects blood pressure.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="font-bold {analysis.healthMetrics.sodiumPotassiumRatio < 1 ? 'text-emerald-600' : 'text-rose-600'} text-xl">
                  {analysis.healthMetrics.sodiumPotassiumRatio.toFixed(2)}
                </div>
                <div class="mt-1">
                  <span class="font-bold text-[9px] uppercase tracking-tight">
                    {analysis.healthMetrics.sodiumPotassiumRatio < 1 ? 'Balanced' : 'High Sodium'}
                  </span>
                </div>
              </div>
            </div>

            <!-- Visualization Section -->
            <div class="gap-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mb-8">
              <GlycaemicChart
                gi={analysis.totalGI}
                gl={analysis.healthMetrics.glycaemicLoad}
                synergy={analysis.healthMetrics.macronutrientSynergy}
              />
              <MacroChart
                protein={macroTotals.protein}
                fat={macroTotals.fat}
                fibre={macroTotals.fibre}
                carbs={macroTotals.carbs}
              />
              <NutrientRadarChart
                gl={analysis.healthMetrics.glycaemicLoad}
                fiber={macroTotals.fibre}
                protein={macroTotals.protein}
                sodiumPotassiumRatio={analysis.healthMetrics.sodiumPotassiumRatio}
                saturatedFatPercent={analysis.healthMetrics.saturatedFatCaloriesPercent}
              />
            </div>

            <div class="bg-indigo-50/50 mb-6 p-4 border border-indigo-100 rounded-2xl">
              <div class="flex items-center mb-2">
                <div class="flex justify-center items-center bg-indigo-100 mr-2 rounded-lg w-6 h-6">
                  <i class="text-indigo-600 text-xs fas fa-microscope"></i>
                </div>
                <h3 class="font-bold text-indigo-900 text-sm">Clinical Pillar Assessment</h3>
                {#if analysis?.healthMetrics.ageRisk}
                  <Tooltip class="-m-1 p-1">
                    {#snippet children()}
                      <span class="ml-auto px-2 py-0.5 rounded-full font-bold text-[9px] uppercase cursor-help {analysis?.healthMetrics.ageRisk === 'low' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                        AGE Risk: {analysis?.healthMetrics.ageRisk}
                      </span>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Advanced Glycation End-products</p>
                      <p class="font-normal text-xs">Inflammatory compounds that form when proteins/fats bond with sugar, especially during high-heat cooking.</p>
                    {/snippet}
                  </Tooltip>
                {/if}
              </div>
              <p class="mb-4 text-indigo-800 text-xs leading-relaxed">
                {analysis?.healthMetrics.pillarExplanation}
              </p>

              <!-- Advanced Metrics Row -->
              <div class="gap-3 grid grid-cols-1 sm:grid-cols-3 pt-3 border-indigo-100/50 border-t">
                <div class="bg-white/60 p-2 border border-indigo-50 rounded-xl">
                  <Tooltip class="-m-1 p-1">
                    {#snippet children()}
                      <div class="border-indigo-100 border-b border-dotted w-fit font-bold text-[9px] text-indigo-400 uppercase cursor-help">Fibre : Carb</div>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">The 5:1 Rule</p>
                      <p class="font-normal text-xs">Aim for at least 1g of fibre for every 5g of carbs to minimize insulin spikes.</p>
                    {/snippet}
                  </Tooltip>
                  <div class="font-bold text-indigo-900 text-xs">{analysis.healthMetrics.fibreToCarbRatio}</div>
                  <div class="text-[8px] text-slate-400">Target 1:5 or better</div>
                </div>
                <div class="bg-white/60 p-2 border border-indigo-50 rounded-xl">
                  <Tooltip class="-m-1 p-1">
                    {#snippet children()}
                      <div class="border-indigo-100 border-b border-dotted w-fit font-bold text-[9px] text-indigo-400 uppercase cursor-help">Sat. Fat %</div>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Saturated Fat Calories</p>
                      <p class="font-normal text-xs">The NHS recommends keeping saturated fat under 6% of total calories for heart health.</p>
                    {/snippet}
                  </Tooltip>
                  <div class="text-xs font-bold {analysis.healthMetrics.saturatedFatCaloriesPercent < 6 ? 'text-emerald-600' : 'text-amber-600'}">
                    {analysis.healthMetrics.saturatedFatCaloriesPercent.toFixed(1)}%
                  </div>
                  <div class="text-[8px] text-slate-400">NHS Target &lt; 6%</div>
                </div>
                <div class="bg-white/60 p-2 border border-indigo-50 rounded-xl">
                  <Tooltip class="-m-1 p-1">
                    {#snippet children()}
                      <div class="border-indigo-100 border-b border-dotted w-fit font-bold text-[9px] text-indigo-400 uppercase cursor-help">Heart Health</div>
                    {/snippet}
                    {#snippet content()}
                      <p class="font-bold">Heart Health Score</p>
                      <p class="font-normal text-xs">Composite score based on lipid ratios, sodium balance, and fibre content. Goal is 80+.</p>
                    {/snippet}
                  </Tooltip>
                  <div class="font-bold text-indigo-900 text-xs">{analysis.healthMetrics.heartHealthScore}/100</div>
                  <div class="bg-indigo-100 mt-1 rounded-full w-full h-1 overflow-hidden">
                    <div class="bg-indigo-500 h-full" style="width: {analysis.healthMetrics.heartHealthScore}%"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Ingredients Table -->
            <div class="mb-6">
              <h3 class="mb-3 px-2 font-bold text-slate-800 text-base">Ingredient Clinical Data</h3>
              <div class="border border-slate-100 rounded-2xl overflow-hidden overflow-x-auto">
                <table class="w-full text-left">
                  <thead class="bg-slate-50 border-slate-100 border-b">
                    <tr>
                      <th class="px-4 py-3 font-bold text-[10px] text-slate-500 uppercase">Ingredient</th>
                      <th class="px-2 py-3 font-bold text-[10px] text-slate-500 text-center uppercase">
                        <Tooltip class="-m-1 p-1">
                          {#snippet children()}
                            <span class="border-slate-300 border-b border-dotted cursor-help">P / F / FB</span>
                          {/snippet}
                          {#snippet content()}
                            <p class="font-bold">Protein / Fat / Fibre</p>
                            <p class="font-normal text-xs">Essential nutrients that slow down carbohydrate digestion and glucose absorption.</p>
                          {/snippet}
                        </Tooltip>
                      </th>
                      <th class="px-2 py-3 font-bold text-[10px] text-slate-500 text-center uppercase">
                        <Tooltip class="-m-1 p-1">
                          {#snippet children()}
                            <span class="border-slate-300 border-b border-dotted cursor-help">GI</span>
                          {/snippet}
                          {#snippet content()}
                            <p class="font-bold">Glycaemic Index (GI)</p>
                            <p class="font-normal text-xs">Ranks how quickly foods raise blood sugar (0-100). Low: &le;55, Med: 56-69, High: 70+.</p>
                          {/snippet}
                        </Tooltip>
                      </th>
                      <th class="px-2 py-3 font-bold text-[10px] text-slate-500 text-center uppercase">
                        <Tooltip class="-m-1 p-1">
                          {#snippet children()}
                            <span class="border-slate-300 border-b border-dotted cursor-help">GL</span>
                          {/snippet}
                          {#snippet content()}
                            <p class="font-bold">Glycaemic Load (GL)</p>
                            <p class="font-normal text-xs">Measures glycaemic impact based on serving size. Low: &le;10, Med: 11-19, High: 20+.</p>
                          {/snippet}
                        </Tooltip>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100">
                    {#each analysis.ingredients as ing}
                      <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-3">
                          <div class="font-bold text-slate-700 text-sm">{ing.name}</div>
                          <div class="flex flex-wrap gap-1 mt-1">
                            {#if ing.groundingSource && ing.groundingSource !== 'ESTIMATED'}
                              <Tooltip class="-m-1 p-1">
                                {#snippet children()}
                                  <span class="bg-emerald-50 px-1 py-0.5 rounded font-bold text-[8px] text-emerald-600 uppercase tracking-tighter cursor-help">
                                    {ing.groundingSource} Match
                                  </span>
                                {/snippet}
                                {#snippet content()}
                                  <p class="font-bold">Clinical Data Match</p>
                                  <p class="font-normal text-xs">This ingredient was successfully matched against the {ing.groundingSource === 'USDA' ? 'USDA Foundation Food' : 'International GI'} database.</p>
                                {/snippet}
                              </Tooltip>
                            {/if}
                            {#if ing.smokePointWarning}
                              <Tooltip class="-m-1 p-1">
                                {#snippet children()}
                                  <span class="bg-amber-100 px-1 py-0.5 rounded font-bold text-[8px] text-amber-600 uppercase tracking-tighter cursor-help">
                                    <i class="mr-0.5 fas fa-temperature-high"></i> Smoke Point
                                  </span>
                                {/snippet}
                                {#snippet content()}
                                  <p class="font-bold text-amber-600">Toxic Compound Alert</p>
                                  <p class="font-normal text-xs">{ing.smokePointWarning}</p>
                                {/snippet}
                              </Tooltip>
                            {/if}
                            {#if ing.hiddenSugarDetection}
                              <Tooltip class="-m-1 p-1">
                                {#snippet children()}
                                  <span class="bg-rose-100 px-1 py-0.5 rounded font-bold text-[8px] text-rose-600 uppercase tracking-tighter cursor-help">
                                    <i class="mr-0.5 fas fa-cookie"></i> Hidden Sugar
                                  </span>
                                {/snippet}
                                {#snippet content()}
                                  <p class="font-bold text-rose-600">Metabolic Disruptor</p>
                                  <p class="font-normal text-xs">{ing.hiddenSugarDetection}</p>
                                {/snippet}
                              </Tooltip>
                            {/if}
                          </div>
                        </td>
                        <td class="px-2 py-3">
                          <div class="flex justify-center gap-1.5 opacity-80 grayscale-[0.5]">
                            <Tooltip class="-m-1 p-1">
                              {#snippet children()}
                                <span class="bg-blue-50 px-1 border border-blue-100 rounded text-[10px] text-blue-700 cursor-help">{ing.protein}g</span>
                              {/snippet}
                              {#snippet content()}
                                <span class="font-bold">Protein</span>
                              {/snippet}
                            </Tooltip>
                            <Tooltip class="-m-1 p-1">
                              {#snippet children()}
                                <span class="bg-amber-50 px-1 border border-amber-100 rounded text-[10px] text-amber-700 cursor-help">{ing.fat}g</span>
                              {/snippet}
                              {#snippet content()}
                                <span class="font-bold">Fat</span>
                              {/snippet}
                            </Tooltip>
                            <Tooltip class="-m-1 p-1">
                              {#snippet children()}
                                <span class="bg-emerald-50 px-1 border border-emerald-100 rounded text-[10px] text-emerald-700 cursor-help">{ing.fibre}g</span>
                              {/snippet}
                              {#snippet content()}
                                <span class="font-bold">Fibre</span>
                              {/snippet}
                            </Tooltip>
                          </div>
                        </td>
                        <td class="px-2 py-3 text-sm text-center font-bold {ing.gi > 70 ? 'text-rose-500' : ing.gi > 55 ? 'text-amber-500' : 'text-emerald-500'}">
                          {ing.gi}
                        </td>
                        <td class="px-2 py-3 font-bold text-slate-600 text-sm text-center">{ing.gl}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              <p class="mt-2 px-2 text-[9px] text-slate-400 italic">
                * Cross-referenced against 2025 USDA Foundation Food Data and International GI Databases.
              </p>
            </div>

            <!-- Method Impact -->
            <div class="bg-amber-50 mb-6 p-4 border border-amber-100 rounded-2xl">
              <h3 class="flex items-center mb-2 font-bold text-amber-900 text-sm">
                <i class="mr-2 fas fa-fire-burner"></i> Preparation Impact
              </h3>
              <p class="text-amber-800 text-xs leading-relaxed">
                {analysis.methodImpact}
              </p>
            </div>

            <!-- Swaps & Summary Tabs -->
            <div class="space-y-5">
              <div class="bg-sky-50 p-4 border border-sky-100 rounded-2xl">
                <h3 class="flex items-center mb-3 font-bold text-sky-900 text-sm">
                  <i class="mr-2 fas fa-arrows-rotate"></i> Healthier Alternatives
                </h3>
                <div class="space-y-2.5">
                  {#each analysis.swaps as swap}
                    <div class="bg-white/60 p-2.5 border border-sky-100 rounded-xl">
                      <div class="flex items-center mb-0.5 font-bold text-slate-700 text-xs">
                        <span class="mr-2 text-rose-500 line-through">{swap.original}</span>
                        <i class="fa-arrow-right mx-2 text-[10px] text-sky-400 fas"></i>
                        <span class="text-emerald-600">{swap.replacement}</span>
                      </div>
                      <p class="text-[10px] text-slate-500">{swap.benefit}</p>
                    </div>
                  {/each}
                </div>
              </div>

              <div class="px-2 max-w-none text-sm prose prose-slate prose-sm markdown-content">
                <h3 class="mb-2 font-bold text-slate-800 text-base">The Expert's Take</h3>
                <SvelteMarkdown source={analysis.summary} />
              </div>
            </div>
          </div>

          <!-- Chat Section -->
          <div class="slide-in-from-bottom-4 flex flex-col shadow-xl border border-white/50 rounded-3xl h-112.5 overflow-hidden animate-in duration-500 delay-200 glass fade-in">
            <div class="flex justify-between items-center bg-white/50 p-3.5 border-slate-100 border-b">
              <div class="flex items-center">
                <div class="relative">
                  <div class="flex justify-center items-center bg-emerald-500 rounded-full w-9 h-9 text-white">
                    <i class="text-sm fas fa-robot"></i>
                  </div>
                  <div class="right-0 bottom-0 absolute bg-green-400 border-2 border-white rounded-full w-2.5 h-2.5"></div>
                </div>
                <div class="ml-3">
                  <div class="font-bold text-slate-800 text-xs">GlycoWise Expert</div>
                  <div class="font-medium text-[9px] text-slate-400 uppercase tracking-wider">Clinical Dietitian Online</div>
                </div>
              </div>
            </div>

            <div class="flex-1 space-y-4 bg-slate-50/30 p-4 overflow-y-auto">
              {#if chatHistory.length === 0}
                <div class="px-8 py-10 text-center">
                  <div class="flex justify-center items-center bg-white shadow-sm mx-auto mb-3 rounded-2xl w-14 h-14 text-emerald-400">
                    <i class="text-xl fas fa-comments"></i>
                  </div>
                  <h4 class="mb-1 font-bold text-slate-800 text-sm">Ask a Follow-up</h4>
                  <p class="text-slate-500 text-xs">"How can I lower the GL of this dish?" or "Is this safe for gestational diabetes?"</p>
                </div>
              {/if}

              {#each chatHistory as msg}
                <div class="flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'}">
                  <div class="max-w-[85%] {msg.role === 'user' ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-none' : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none'} p-2.5 shadow-sm">
                    <div class="prose-invert text-xs prose prose-sm markdown-content">
                      <SvelteMarkdown source={msg.text} />
                    </div>
                  </div>
                  {#if msg.usage}
                    <span class="mt-1 px-1 text-[9px] text-slate-400">
                      ${msg.usage.estimatedCost.toFixed(5)} ({msg.usage.totalTokens} tokens)
                    </span>
                  {/if}
                </div>
              {/each}

              {#if isChatting}
                <div class="flex justify-start">
                  <div class="bg-white shadow-sm p-4 border border-slate-100 rounded-2xl rounded-tl-none">
                    <div class="flex space-x-1">
                      <div class="bg-emerald-400 rounded-full w-2 h-2 animate-bounce"></div>
                      <div class="bg-emerald-400 rounded-full w-2 h-2 animate-bounce delay-100"></div>
                      <div class="bg-emerald-400 rounded-full w-2 h-2 animate-bounce delay-200"></div>
                    </div>
                  </div>
                </div>
              {/if}
              <div bind:this={chatEndRef}></div>
            </div>

            <form
              onsubmit={handleSendMessage}
              class="flex items-center space-x-2 bg-white p-3.5 border-slate-100 border-t"
            >
              <input
                type="text"
                placeholder="Type your question..."
                class="flex-1 bg-slate-50 p-2.5 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 text-xs transition-all"
                bind:value={chatInput}
                disabled={isChatting}
              />
              <button
                type="submit"
                disabled={isChatting || !chatInput.trim()}
                aria-label="Send message"
                class="flex justify-center items-center bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-emerald-200 shadow-lg rounded-xl w-9 h-9 text-white transition-all"
              >
                <i class="text-xs fas fa-paper-plane"></i>
              </button>
            </form>
          </div>
        {:else if status === AnalysisStatus.IDLE}
          <div class="flex flex-col justify-center items-center bg-white/30 p-10 border border-slate-300 border-dashed rounded-3xl h-full text-center">
            <div class="flex justify-center items-center bg-emerald-50 mb-5 rounded-full w-16 h-16 text-emerald-300">
              <i class="text-3xl fas fa-chart-line"></i>
            </div>
            <h3 class="mb-1.5 font-bold text-slate-800 text-lg">Ready for Analysis</h3>
            <p class="max-w-sm text-slate-500 text-sm">Provide a recipe or food photo on the left to see its glycaemic impact here.</p>
          </div>
        {:else if status === AnalysisStatus.LOADING}
           <div class="flex flex-col justify-center items-center p-10 h-full text-center">
            <div class="relative mb-5 w-20 h-20">
              <div class="absolute inset-0 border-4 border-emerald-100 rounded-full"></div>
              <div class="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <div class="absolute inset-0 flex justify-center items-center text-emerald-500">
                <i class="text-xl fas fa-dna"></i>
              </div>
            </div>
            <h3 class="mb-1.5 font-bold text-slate-800 text-lg">Scanning Food Data</h3>
            <p class="text-slate-400 text-sm animate-pulse">Our AI dietitian is calculating GI values...</p>
          </div>
        {/if}
      </section>
    </div>
  </div>

  <footer class="mt-12 text-[10px] text-slate-400 text-center">
    <p>© 2026 GlycoWise. Powered by Gemini 3 Flash (Preview). For educational purposes only. Not medical advice.</p>
  </footer>
</div>

{#if showApiKeyPrompt}
  <div class="z-100 fixed inset-0 flex justify-center items-center bg-slate-900/60 backdrop-blur-sm p-4">
    <div class="bg-white shadow-2xl p-8 rounded-3xl w-full max-w-md animate-in duration-200 zoom-in-95">
      <div class="mb-6 text-center">
        <div class="flex justify-center items-center bg-emerald-100 mx-auto mb-4 rounded-2xl w-16 h-16">
          <i class="text-emerald-600 text-2xl fas fa-key"></i>
        </div>
        <h2 class="font-bold text-slate-800 text-2xl">Gemini API Key</h2>
        <p class="mt-2 text-slate-500 text-sm">
          To provide expert dietitian analysis, GlycoWise uses Google Gemini 3 Flash (Preview). Your key is stored locally in your browser and never sent to our servers.
        </p>
      </div>

      <div class="space-y-4">
        <div>
          <label for="apiKey" class="block mb-2 px-1 font-bold text-slate-500 text-xs uppercase tracking-widest">
            Enter AI API Key
          </label>
          <input
            id="apiKey"
            type="password"
            class="bg-slate-50 p-4 border border-slate-200 focus:border-transparent rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 w-full transition-all"
            placeholder="AIzaSy..."
            bind:value={tempApiKey}
          />
        </div>

        <button
          onclick={saveApiKey}
          class="bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl w-full font-bold text-white transition-colors"
        >
          Save & Continue
        </button>

        <p class="text-[11px] text-slate-400 text-center">
          Don't have a key? Get one for free at
          <a href="https://aistudio.google.com/app/apikey" target="_blank" class="font-bold text-emerald-600 hover:underline">Google AI Studio</a>
        </p>

        {#if typeof localStorage !== 'undefined' && localStorage.getItem('gemini_api_key')}
          <button
            onclick={() => showApiKeyPrompt = false}
            class="py-2 w-full font-medium text-slate-500 hover:text-slate-800 text-xs"
          >
            Cancel
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @reference "tailwindcss";

  :global(body) {
    @apply text-slate-800 antialiased;
  }

  .glass {
    @apply bg-white/70 backdrop-blur-md;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    @apply bg-slate-200 rounded-full;
  }
</style>
