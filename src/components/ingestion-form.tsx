'use client';

import { useState } from 'react';
import { ArrowRight, FileJson, Globe, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface IngestionFormProps {
  onIngest: (data: string, type: 'url' | 'text') => Promise<void>;
  isLoading: boolean;
}

export function IngestionForm({ onIngest, isLoading }: IngestionFormProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'text'>('url');
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onIngest(inputValue, activeTab);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('url')}
            className={twMerge(
              "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors",
              activeTab === 'url' ? "bg-zinc-800/50 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/30"
            )}
          >
            <Globe size={16} />
            URL Import
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={twMerge(
              "flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors",
              activeTab === 'text' ? "bg-zinc-800/50 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/30"
            )}
          >
            <FileJson size={16} />
            Raw JSON/YAML
          </button>
        </div>

        {/* content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative">
            {activeTab === 'url' ? (
              <input
                type="url"
                placeholder="https://petstore.swagger.io/v2/swagger.json"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all font-mono text-sm"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
            ) : (
              <textarea
                placeholder='{"openapi": "3.0.0", ...}'
                className="w-full h-48 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all font-mono text-sm resize-none"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
            )}
            
            <div className="absolute -inset-0.5 bg-linear-to-r from-indigo-500 to-fuchsia-500 rounded-xl opacity-25 blur pointer-events-none group-hover:opacity-50 transition duration-1000"></div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="w-full group relative flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 text-white font-medium py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 active:scale-[0.98]"
          >
            {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
            ) : (
                <>
                Generate MOJ
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
            )}
          </button>
        </form>
      </div>
      
      <p className="text-center text-zinc-500 text-xs mt-4">
        Supported formats: OpenAPI 3.0, 3.1, Swagger 2.0 (JSON/YAML)
      </p>
    </div>
  );
}
