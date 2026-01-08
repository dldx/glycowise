<script lang="ts">
  import { onMount } from 'svelte';
  import { analyzeRecipe, startRecipeChat } from '$lib/geminiService';
  import { AnalysisStatus } from '$lib/types';
  import type { RecipeAnalysis, ChatMessage } from '$lib/types';
  import type { Chat } from "@google/genai";
  import SvelteMarkdown from 'svelte-markdown';
  import Tooltip from '$lib/components/ui/tooltip.svelte';

  let recipeText = $state('');
  let image = $state<string | null>(null);
  let status = $state(AnalysisStatus.IDLE);
  let analysis = $state<RecipeAnalysis | null>(null);
  let error = $state<string | null>(null);

  // Chat States
  let chatSession = $state<Chat | null>(null);
  let chatHistory = $state<ChatMessage[]>([]);
  let chatInput = $state('');
  let isChatting = $state(false);
  let chatEndRef: HTMLDivElement | undefined = $state();

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

  const handleAnalyze = async () => {
    if (!recipeText && !image) {
      error = "Please provide a recipe description or a photo.";
      return;
    }

    status = AnalysisStatus.LOADING;
    error = null;
    chatHistory = [];
    analysis = null;

    try {
      const result = await analyzeRecipe(recipeText || "Analyze this dish", image || undefined);
      analysis = result;
      const session = startRecipeChat(result);
      chatSession = session;
      status = AnalysisStatus.SUCCESS;
    } catch (err) {
      console.error(err);
      error = "Failed to analyze the recipe. Please try again.";
      status = AnalysisStatus.ERROR;
    }
  };

  const handleSendMessage = async (e?: Event) => {
    e?.preventDefault();
    if (!chatInput.trim() || !chatSession || isChatting) return;

    const userMessage = chatInput.trim();
    chatInput = '';
    chatHistory = [...chatHistory, { role: 'user', text: userMessage }];
    isChatting = true;

    try {
      const stream = await chatSession.sendMessageStream({ message: userMessage });
      let fullResponse = '';

      chatHistory = [...chatHistory, { role: 'model', text: '' }];

      for await (const chunk of stream) {
        fullResponse += chunk.text;
        const newHistory = [...chatHistory];
        newHistory[newHistory.length - 1].text = fullResponse;
        chatHistory = newHistory;
      }
    } catch (err) {
      console.error(err);
      error = "Failed to send message.";
    } finally {
      isChatting = false;
    }
  };

  $effect(() => {
    if (chatHistory || isChatting) {
      chatEndRef?.scrollIntoView({ behavior: "smooth" });
    }
  });
</script>

<div class="bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-3 md:p-6 min-h-screen">
  <div class="mx-auto max-w-6xl">
    <!-- Header -->
    <header class="relative mb-8 text-center">
      <div class="top-0 right-0 absolute">
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
        <h1 class="bg-clip-text bg-gradient-to-r from-emerald-600 to-sky-600 font-bold text-transparent text-2xl">
          GlycoWise
        </h1>
      </div>
      <p class="text-slate-600 text-base">Intelligent Glycemic Index & Load Analysis</p>
      <p class="mt-1 font-medium text-emerald-600 text-xs uppercase tracking-widest">Powered by Gemini 3 Flash (Preview)</p>
      <div class="mx-auto mt-6 max-w-2xl">
        <p class="bg-emerald-50/50 shadow-sm p-4 border border-emerald-100/50 rounded-2xl text-slate-600 text-sm leading-relaxed">
          GlycoWise provides data-driven insights into the glycemic impact of your meals. By cross-referencing ingredients with clinical database records, we estimate Glycemic Index and Load to help you manage blood glucose levels effectively.
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
              placeholder="Example: One cup of cooked white rice with two grilled chicken breasts and steamed broccoli..."
              bind:value={recipeText}
            ></textarea>
          </div>

          <div class="group relative">
            <label class="block mb-2 font-semibold text-slate-700 text-sm">
              Food Photo (Optional)
            </label>
            <div class="relative flex flex-col justify-center items-center bg-white/30 border-2 border-slate-300 border-dashed rounded-2xl w-full h-44 overflow-hidden transition-all">
              {#if image}
                <img src={image} alt="Preview" class="w-full h-full object-cover" />
                <button
                  onclick={() => { image = null; stopCamera(); }}
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
            onclick={handleAnalyze}
            disabled={status === AnalysisStatus.LOADING}
            class="bg-gradient-to-r from-emerald-500 to-emerald-600 disabled:opacity-50 shadow-emerald-200 shadow-lg hover:shadow-emerald-300 py-3.5 rounded-2xl w-full font-bold text-white text-sm disabled:transform-none transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed"
          >
            {#if status === AnalysisStatus.LOADING}
              <i class="mr-2 fas fa-spinner fa-spin"></i> Analyzing...
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
      </section>

      <!-- Results Section -->
      <section class="space-y-6">
        {#if status === AnalysisStatus.SUCCESS && analysis}
          <div class="slide-in-from-bottom-4 shadow-xl p-5 border border-white/50 rounded-3xl animate-in duration-500 glass fade-in">
            <h2 class="flex items-center mb-5 font-bold text-slate-800 text-xl">
              <span class="bg-emerald-500 mr-4 rounded-full w-2 h-7"></span>
              Analysis for: {analysis.recipeName}
            </h2>

            <!-- Metrics Grid -->
            <div class="gap-4 grid grid-cols-2 mb-6">
              <div class="bg-white shadow-sm p-4 border border-slate-100 rounded-2xl">
                <div class="mb-1 font-medium text-slate-500 text-xs">
                  Glycemic Index
                  <Tooltip class="ml-1 align-middle">
                    {#snippet children()}
                      <i class="text-[10px] text-slate-300 hover:text-emerald-500 transition-colors cursor-help fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="mb-1 pb-1 border-slate-700 border-b font-bold">Glycemic Index (GI)</p>
                      <p class="font-normal leading-relaxed">A rating system for foods containing carbohydrates. It shows how quickly each food affects your blood sugar (glucose) level when that food is eaten on its own.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="mb-1 font-bold text-slate-800 text-2xl">{analysis.totalGI}</div>
                <span class="bg-emerald-100 px-2 py-0.5 rounded font-bold text-[10px] text-emerald-700 uppercase tracking-wider">
                  {analysis.giCategory} GI
                </span>
              </div>
              <div class="bg-white shadow-sm p-4 border border-slate-100 rounded-2xl">
                <div class="mb-1 font-medium text-slate-500 text-xs">
                  Glycemic Load
                  <Tooltip class="ml-1 align-middle">
                    {#snippet children()}
                      <i class="text-[10px] text-slate-300 hover:text-emerald-500 transition-colors cursor-help fas fa-circle-info"></i>
                    {/snippet}
                    {#snippet content()}
                      <p class="mb-1 pb-1 border-slate-700 border-b font-bold">Glycemic Load (GL)</p>
                      <p class="font-normal leading-relaxed">Glycemic Load (GL) combines both the GI and the amount of carbohydrate in the food to give a more accurate picture of a food's real-world impact on blood sugar.</p>
                    {/snippet}
                  </Tooltip>
                </div>
                <div class="mb-1 font-bold text-slate-800 text-2xl">{analysis.totalGL}</div>
                <span class="bg-sky-100 px-2 py-0.5 rounded font-bold text-[10px] text-sky-700 uppercase tracking-wider">
                  {analysis.glCategory} GL
                </span>
              </div>
            </div>

            <!-- Ingredients Table -->
            <div class="mb-6">
              <h3 class="mb-3 px-2 font-bold text-slate-800 text-base">Detailed Breakdown</h3>
              <div class="border border-slate-100 rounded-2xl overflow-hidden">
                <table class="w-full text-left">
                  <thead class="bg-slate-50 border-slate-100 border-b">
                    <tr>
                      <th class="px-4 py-2 font-bold text-[10px] text-slate-500 uppercase">Ingredient</th>
                      <th class="px-4 py-2 font-bold text-[10px] text-slate-500 text-center uppercase">GI</th>
                      <th class="px-4 py-2 font-bold text-[10px] text-slate-500 text-center uppercase">GL</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-slate-100">
                    {#each analysis.ingredients as ing}
                      <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-4 py-2.5 font-medium text-slate-700 text-sm">
                          {ing.name}
                          <div class="mt-0.5 font-normal text-[10px] text-slate-400">{ing.notes}</div>
                          {#if ing.citation && ing.citation !== 'null' && ing.citation !== ''}
                            <div class="flex items-center bg-emerald-50 mt-1 px-1.5 py-0.5 rounded w-fit font-semibold text-[9px] text-emerald-600">
                              <i class="mr-1 fas fa-book-open"></i> Source: {ing.citation}
                            </div>
                          {/if}
                        </td>
                        <td class="px-4 py-2.5 text-sm text-center font-bold {ing.gi > 70 ? 'text-rose-500' : ing.gi > 55 ? 'text-amber-500' : 'text-emerald-500'}">
                          {ing.gi}
                        </td>
                        <td class="px-4 py-2.5 font-bold text-slate-600 text-sm text-center">{ing.gl}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
              {#if analysis.ingredients.some(i => i.citation && i.citation !== 'null' && i.citation !== '')}
                <p class="mt-2 px-2 text-[9px] text-slate-400 italic">
                  * Sources cited from the <a href="https://glycemicindex.com/gi-search/" target="_blank" class="font-medium text-emerald-600 hover:underline">Glycemic Index Database</a>.
                </p>
              {/if}
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
          <div class="slide-in-from-bottom-4 flex flex-col shadow-xl border border-white/50 rounded-3xl h-[450px] overflow-hidden animate-in duration-500 delay-200 glass fade-in">
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
                  <div class="font-medium text-[9px] text-slate-400 uppercase tracking-wider">Clinical Nutritionist Online</div>
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
                <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
                  <div class="max-w-[85%] {msg.role === 'user' ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-none' : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none'} p-2.5 shadow-sm">
                    <div class="prose-invert text-xs prose prose-sm markdown-content">
                      <SvelteMarkdown source={msg.text} />
                    </div>
                  </div>
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
            <p class="max-w-sm text-slate-500 text-sm">Provide a recipe or food photo on the left to see its glycemic impact here.</p>
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
            <p class="text-slate-400 text-sm animate-pulse">Our AI nutritionist is calculating GI values...</p>
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
  <div class="z-[100] fixed inset-0 flex justify-center items-center bg-slate-900/60 backdrop-blur-sm p-4">
    <div class="bg-white shadow-2xl p-8 rounded-3xl w-full max-w-md animate-in duration-200 zoom-in-95">
      <div class="mb-6 text-center">
        <div class="flex justify-center items-center bg-emerald-100 mx-auto mb-4 rounded-2xl w-16 h-16">
          <i class="text-emerald-600 text-2xl fas fa-key"></i>
        </div>
        <h2 class="font-bold text-slate-800 text-2xl">Gemini API Key</h2>
        <p class="mt-2 text-slate-500 text-sm">
          To provide expert nutritionist analysis, GlycoWise uses Google Gemini 3 Flash (Preview). Your key is stored locally in your browser and never sent to our servers.
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
</style>
