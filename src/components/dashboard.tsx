'use client';

import { useState } from 'react';
import { IngestionForm } from './ingestion-form';
import { JsonEditor } from './json-editor';
import { Copy, Check, Terminal, Sparkles, Zap } from 'lucide-react';
import { MOJOutput } from '@/lib/schema-validation';
import { transformToMOJ, ingestSpec } from '@/lib/moj-transformer'; // keep ingestSpec for text input
import { ingestUrlAction } from '@/app/actions/ingest';

export function Dashboard() {
  const [isLoading, setIsLoading] = useState(false);
  const [mojOutput, setMojOutput] = useState<MOJOutput | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIngest = async (data: string, type: 'url' | 'text', provider: 'swagger' | 'postman') => {
    setIsLoading(true);
    setError(null);
    try {
      let spec;

      if (provider === 'postman') {
        throw new Error('Postman integration is coming soon! Please use Swagger/OpenAPI for now.');
      }

      if (type === 'url') {
         const result = await ingestUrlAction(data);
         if (!result.success || !result.data) {
             throw new Error(result.error || 'Failed to ingest URL');
         }
         spec = result.data;
      } else {
         try {
             // For text input, we can still use the client-side parser or move it to server too. 
             // Keeping client-side for text input is fine as it doesn't have CORS issues.
             const parsed = JSON.parse(data);
             spec = await ingestSpec(parsed);
         } catch {
             // If JSON parse fails, try passing raw string (might be yaml, swagger-parser handles it)
             spec = await ingestSpec(data);
         }
      }
      
      const moj = transformToMOJ(spec);
      setMojOutput(moj);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse specification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!mojOutput) return;
    navigator.clipboard.writeText(JSON.stringify(mojOutput, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-indigo-500/30">
      
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-linear-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white to-zinc-400">
              API to MOJ
            </span>
          </div>
          <div className="flex items-center gap-4">
             <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors text-sm font-medium">
                GitHub
             </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-medium mb-4">
            <Sparkles size={12} className="text-indigo-400" />
            <span>AI-Ready API Specifications</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white max-w-3xl mx-auto leading-tight">
            Turn Complex API Docs into <br />
            <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
              AI-Optimized JSON
            </span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Stop feeding LLMs fluff. Convert Swagger/OpenAPI specs into a token-efficient, predictive format designed for high-performance AI agents.
          </p>
        </div>

        {/* Ingestion & Output Area */}
        <div className="space-y-8">
            <IngestionForm onIngest={handleIngest} isLoading={isLoading} />

            {error && (
                <div className="max-w-2xl mx-auto p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
                    {error}
                </div>
            )}

            {mojOutput && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="flex items-center justify-between mb-4 px-2">
                        <div className="flex items-center gap-2 text-zinc-400">
                            <Terminal size={18} />
                            <span className="font-mono text-sm">output.moj.json</span>
                        </div>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors border border-zinc-700"
                        >
                            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            {copied ? 'Copied!' : 'Copy JSON'}
                        </button>
                    </div>

                    <div className="relative group h-[600px]">
                        <div className="absolute -inset-0.5 bg-linear-to-r from-indigo-500 to-fuchsia-500 rounded-2xl opacity-20 blur group-hover:opacity-30 transition duration-1000"></div>
                        <div className="relative h-full bg-zinc-950 rounded-xl overflow-hidden shadow-2xl">
                            <JsonEditor 
                                value={JSON.stringify(mojOutput, null, 2)} 
                                readOnly={true} 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
      </main>
      
      {/* Footer */}
        <footer className="border-t border-zinc-900 mt-20 py-8 text-center text-zinc-600 text-sm">
            &copy; {new Date().getFullYear()} MOJ Generator. Built for the AI Agent Era.
        </footer>
    </div>
  );
}
