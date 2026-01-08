
import React, { useState, useRef, useEffect } from 'react';
import { analyzeRecipe, startRecipeChat } from './geminiService';
import { RecipeAnalysis, AnalysisStatus, ChatMessage } from './types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label
} from 'recharts';
import { Chat, GenerateContentResponse } from "@google/genai";
import ReactMarkdown from 'react-markdown';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

const InfoTooltip: React.FC<{ title: string; content: string }> = ({ title, content }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <i className="fas fa-circle-info text-slate-300 hover:text-emerald-500 cursor-help transition-colors text-xs"></i>
    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50">
      <p className="font-bold mb-1 border-b border-slate-700 pb-1">{title}</p>
      <p className="leading-relaxed font-normal">{content}</p>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [recipeText, setRecipeText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [analysis, setAnalysis] = useState<RecipeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chat States
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isChatting]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setImage(base64);
    }
  };

  const handleAnalyze = async () => {
    if (!recipeText && !image) {
      setError("Please provide a recipe description or a photo.");
      return;
    }

    setStatus(AnalysisStatus.LOADING);
    setError(null);
    setChatHistory([]);
    setAnalysis(null);

    try {
      const result = await analyzeRecipe(recipeText || "Analyze this dish", image || undefined);
      setAnalysis(result);
      const session = startRecipeChat(result);
      setChatSession(session);
      setStatus(AnalysisStatus.SUCCESS);
    } catch (err) {
      console.error(err);
      setError("Failed to analyze the recipe. Please try again.");
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || !chatSession || isChatting) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatting(true);

    try {
      const stream = await chatSession.sendMessageStream({ message: userMessage });
      let fullResponse = '';
      
      setChatHistory(prev => [...prev, { role: 'model', text: '' }]);

      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        fullResponse += c.text || '';
        setChatHistory(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = { role: 'model', text: fullResponse };
          return newHistory;
        });
      }
    } catch (err) {
      console.error("Chat error:", err);
      setChatHistory(prev => [...prev, { role: 'model', text: "I'm sorry, I encountered an error. Please try asking again." }]);
    } finally {
      setIsChatting(false);
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'low': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'high': return 'text-rose-600 bg-rose-50 border-rose-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const ingredientData = analysis?.ingredients.map(ing => ({
    name: ing.name,
    GI: ing.gi,
    GL: ing.gl
  })) || [];

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white text-xl shadow-lg shadow-emerald-200">
              <i className="fas fa-leaf"></i>
            </div>
            <h1 className="text-xl font-bold tracking-tight">Glyco<span className="text-emerald-600">Guide</span></h1>
          </div>
          <div className="hidden md:block text-sm text-slate-500 font-medium">
            Clinical Nutritional Intelligence
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-2">Recipe Analyzer</h2>
          <p className="text-slate-600 max-w-lg mx-auto">
            Measure glycemic impact with precision. Paste a recipe or upload a photo to begin.
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Recipe or Description</label>
              <textarea
                className="w-full h-40 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-none text-sm outline-none"
                placeholder="e.g., Spaghetti Carbonara with pancetta..."
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Photo of the Dish</label>
              <div className="relative group">
                {image ? (
                  <div className="relative h-40 w-full rounded-xl overflow-hidden border-2 border-emerald-100 shadow-inner">
                    <img src={image} alt="Recipe" className="w-full h-full object-cover" />
                    <button onClick={() => setImage(null)} className="absolute top-2 right-2 bg-white/90 hover:bg-white p-2 rounded-full shadow-md text-rose-500 transition-colors">
                      <i className="fas fa-trash-can"></i>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-40 w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 cursor-pointer transition-all group">
                    <i className="fas fa-camera text-3xl text-slate-300 mb-2 group-hover:text-emerald-500 transition-colors"></i>
                    <span className="text-sm text-slate-500 font-medium">Capture or Upload Meal Photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  </label>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={status === AnalysisStatus.LOADING}
            className="w-full mt-8 bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 disabled:bg-slate-300 transition-all flex items-center justify-center gap-3 shadow-xl shadow-slate-200 active:scale-95"
          >
            {status === AnalysisStatus.LOADING ? (
              <><i className="fas fa-circle-notch fa-spin"></i>Processing Nutritional Data...</>
            ) : (
              <><i className="fas fa-wand-magic-sparkles"></i>Analyze & Start Chat</>
            )}
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 p-4 rounded-xl mb-8 flex items-center gap-3 animate-pulse">
            <i className="fas fa-circle-exclamation text-lg"></i>{error}
          </div>
        )}

        {/* Results Section */}
        {analysis && status === AnalysisStatus.SUCCESS && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
            
            {/* Summary Headers with Info Icons */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className={`p-5 rounded-2xl border-2 ${getCategoryColor(analysis.giCategory)} flex flex-col justify-between transition-transform hover:scale-[1.01]`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <p className="text-xs font-bold uppercase opacity-70 tracking-tight">Avg Glycemic Index (GI)</p>
                    <InfoTooltip 
                      title="Glycemic Index (GI)" 
                      content="GI ranks carbohydrates on a scale from 0 to 100 based on how quickly they raise blood sugar levels. Low: < 55, High: > 70." 
                    />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black border-2 border-current bg-white/60 uppercase">{analysis.giCategory}</span>
                </div>
                <p className="text-4xl font-black">{analysis.totalGI}</p>
              </div>
              <div className={`p-5 rounded-2xl border-2 ${getCategoryColor(analysis.glCategory)} flex flex-col justify-between transition-transform hover:scale-[1.01]`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <p className="text-xs font-bold uppercase opacity-70 tracking-tight">Estimated Glycemic Load (GL)</p>
                    <InfoTooltip 
                      title="Glycemic Load (GL)" 
                      content="GL accounts for the amount of carbohydrate in a serving, providing a real-world picture of blood sugar impact. Low: < 10, High: > 20." 
                    />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black border-2 border-current bg-white/60 uppercase">{analysis.glCategory}</span>
                </div>
                <p className="text-4xl font-black">{analysis.totalGL}</p>
              </div>
            </div>

            {/* Split Charts for GI and GL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
                <h4 className="text-sm font-bold mb-8 flex items-center gap-2 text-slate-700">
                  <i className="fas fa-chart-bar text-emerald-600"></i> GI Breakdown by Ingredient
                </h4>
                <div className="h-64 w-full flex-grow">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ingredientData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{fontSize: 9, fill: '#64748b'}} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{fontSize: 10, fill: '#64748b'}}>
                        <Label value="GI Score (Lower is better)" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fontSize: '10px', fill: '#94a3b8', fontWeight: 600 }} offset={10} />
                      </YAxis>
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="GI" fill="#059669" radius={[4, 4, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
                <h4 className="text-sm font-bold mb-8 flex items-center gap-2 text-slate-700">
                  <i className="fas fa-chart-column text-emerald-500"></i> GL Breakdown by Ingredient
                </h4>
                <div className="h-64 w-full flex-grow">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ingredientData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{fontSize: 9, fill: '#64748b'}} interval={0} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{fontSize: 10, fill: '#64748b'}}>
                        <Label value="GL Estimate (Lower is better)" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fontSize: '10px', fill: '#94a3b8', fontWeight: 600 }} offset={10} />
                      </YAxis>
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                      <Bar dataKey="GL" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Detailed Ingredient Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
                 <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                    <i className="fas fa-list-check text-emerald-600"></i> Detailed Data Sheet
                 </h4>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-xs sm:text-sm">
                   <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                     <tr>
                       <th className="px-6 py-4">Ingredient</th>
                       <th className="px-6 py-4">GI Score</th>
                       <th className="px-6 py-4">GL Estimate</th>
                       <th className="px-6 py-4">Clinical Note</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {analysis.ingredients.map((ing, idx) => (
                       <tr key={idx} className="hover:bg-slate-50 transition-colors">
                         <td className="px-6 py-4 font-semibold text-slate-700">{ing.name}</td>
                         <td className="px-6 py-4">
                           <span className={`font-mono px-2 py-0.5 rounded text-[10px] font-black ${ing.gi > 70 ? 'bg-rose-100 text-rose-700' : ing.gi < 55 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                             {ing.gi}
                           </span>
                         </td>
                         <td className="px-6 py-4 font-mono text-slate-600">{ing.gl}</td>
                         <td className="px-6 py-4 text-slate-500 italic leading-relaxed">{ing.notes}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>

            {/* Recommended Swaps Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b bg-emerald-50/30">
                <h4 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <i className="fas fa-arrows-rotate text-emerald-600"></i> Smart Ingredient Replacements
                </h4>
              </div>
              <div className="p-6 grid gap-6 sm:grid-cols-1">
                {analysis.swaps.map((swap, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 flex flex-col md:flex-row md:items-start gap-6 hover:shadow-lg transition-all border-l-4 border-l-emerald-500">
                    <div className="bg-white rounded-xl p-4 border border-slate-200 flex flex-col items-center justify-center min-w-[140px] shadow-sm">
                      <span className="text-[10px] text-slate-400 line-through font-bold mb-1 uppercase tracking-widest">{swap.original}</span>
                      <i className="fas fa-circle-arrow-down text-emerald-500 my-2 text-lg"></i>
                      <span className="text-sm font-black text-emerald-700 uppercase tracking-tight">{swap.replacement}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-sm shadow-emerald-100">Optimized Swap</span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        <span className="font-bold text-slate-800">Why this works:</span> {swap.benefit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preparation Method Impact */}
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-6 shadow-sm">
              <h4 className="text-sm font-black text-amber-900 mb-3 flex items-center gap-2 uppercase tracking-tight">
                <i className="fas fa-fire-burner"></i> Cooking Technique Influence
              </h4>
              <p className="text-sm text-amber-800 leading-relaxed font-medium">{analysis.methodImpact}</p>
            </div>

            {/* AI Nutritionist Consultation Chat */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/50">
              <div className="p-6 border-b flex items-center justify-between bg-slate-900 text-white">
                <h4 className="text-lg font-bold flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white text-sm">
                    <i className="fas fa-leaf"></i>
                  </div>
                  GlycoGuide Expert Consultation
                </h4>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Active</span>
                </div>
              </div>

              {/* Chat Message Window */}
              <div className="h-[450px] overflow-y-auto p-6 space-y-6 bg-slate-50/50 scroll-smooth">
                {chatHistory.length === 0 && (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 text-emerald-400 border shadow-md">
                      <i className="fas fa-comment-medical text-4xl"></i>
                    </div>
                    <p className="text-slate-900 font-bold mb-1">How can I refine this recipe for you?</p>
                    <p className="text-sm text-slate-400 px-10">Ask about specific carb counts, fiber additions, or low-GI cooking alternatives.</p>
                  </div>
                )}
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-5 rounded-3xl shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-tr-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                    }`}>
                      {msg.role === 'model' && (
                        <div className="flex items-center gap-2 mb-3 text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                          <i className="fas fa-microchip"></i> AI Expert Analysis
                        </div>
                      )}
                      <div className="markdown-content text-sm leading-relaxed">
                        <ReactMarkdown>{msg.text || (isChatting && idx === chatHistory.length - 1 ? 'Working on a detailed response...' : '')}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-5 bg-white border-t border-slate-100 flex gap-3">
                <input
                  type="text"
                  placeholder="Ask a clarifying question..."
                  className="flex-1 bg-slate-100 border-none rounded-2xl px-5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-400 font-medium"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatting}
                />
                <button
                  type="submit"
                  disabled={isChatting || !chatInput.trim()}
                  className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center hover:bg-emerald-700 disabled:bg-slate-200 transition-all shadow-lg shadow-emerald-200 active:scale-90"
                >
                  <i className={`fas ${isChatting ? 'fa-circle-notch fa-spin' : 'fa-paper-plane'}`}></i>
                </button>
              </form>
            </div>
          </div>
        )}

        {!analysis && status === AnalysisStatus.IDLE && (
          <div className="mt-16 p-16 text-center rounded-[2.5rem] bg-white border-2 border-dashed border-slate-200 shadow-sm transition-all hover:border-emerald-300">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8 text-slate-200 shadow-inner">
              <i className="fas fa-clipboard-check text-4xl"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Begin Clinical Analysis</h3>
            <p className="text-slate-500 max-w-sm mx-auto font-medium leading-relaxed">
              Upload your recipe data to generate a complete glycemic profile and consult with our nutrition expert.
            </p>
          </div>
        )}
      </main>

      <footer className="mt-24 py-12 border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-xs">
              <i className="fas fa-leaf"></i>
            </div>
            <span className="font-black text-slate-800 tracking-tight">GlycoGuide Platform</span>
          </div>
          <p className="text-slate-400 text-[10px] mb-6 max-w-lg mx-auto leading-relaxed">
            MEDICAL DISCLAIMER: Analysis results are estimates provided by AI for educational purposes. This is not medical advice. Consult your physician or a registered dietitian before making significant dietary changes.
          </p>
          <div className="flex items-center justify-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
            <span className="hover:text-emerald-500 transition-colors cursor-default">Precision Nutri-AI</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-100"></span>
            <span className="hover:text-emerald-500 transition-colors cursor-default">Evidence Based</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-100"></span>
            <span className="hover:text-emerald-500 transition-colors cursor-default">Real-time GL Data</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
