'use client';

import { useState } from 'react';
import { ArrowRight, FileJson, Globe, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import type { IngestAuth, AuthType, IngestProvider } from '@/app/actions/ingest';

interface IngestionFormProps {
  onIngest: (
    data: string,
    type: 'url' | 'text',
    provider: IngestProvider,
    auth: IngestAuth
  ) => Promise<void>;
  isLoading: boolean;
}

export function IngestionForm({ onIngest, isLoading }: IngestionFormProps) {
  const [activeTab, setActiveTab] = useState<'url' | 'text'>('url');
  const [inputValue, setInputValue] = useState('');
  const [provider, setProvider] = useState<IngestProvider>('swagger');
  const [authType, setAuthType] = useState<AuthType>('none');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [headerName, setHeaderName] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onIngest(inputValue, activeTab, provider, buildAuthState());
  };

  const buildAuthState = (): IngestAuth => {
    switch (authType) {
      case 'bearer':
        return { type: authType, token: token.trim() };
      case 'basic':
        return { type: authType, username: username.trim(), password };
      case 'apiKey':
        return {
          type: authType,
          headerName: headerName.trim(),
          headerValue: headerValue.trim(),
        };
      default:
        return { type: 'none' };
    }
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
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-zinc-300">
              <Globe size={16} className="text-indigo-400" />
              <span className="text-sm font-semibold tracking-wide">Source Provider</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setProvider('swagger')}
                className={twMerge(
                  'rounded-2xl border p-4 text-left transition-all',
                  provider === 'swagger'
                    ? 'border-indigo-500/70 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/80'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Swagger / OpenAPI</span>
                  <span className={twMerge(
                    'h-3 w-3 rounded-full border',
                    provider === 'swagger' ? 'border-indigo-300 bg-indigo-400' : 'border-zinc-600'
                  )} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Best for Swagger UI links, direct `swagger.json` or `openapi.json`, and raw OpenAPI YAML or JSON.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProvider('postman')}
                className={twMerge(
                  'rounded-2xl border p-4 text-left transition-all',
                  provider === 'postman'
                    ? 'border-orange-500/70 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                    : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/80'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Postman Collection</span>
                  <span className={twMerge(
                    'h-3 w-3 rounded-full border',
                    provider === 'postman' ? 'border-orange-300 bg-orange-400' : 'border-zinc-600'
                  )} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  Use published Postman documentation links or raw collection JSON to generate the MOJ structure.
                </p>
              </button>
            </div>
          </div>

          {activeTab === 'url' && (
            <div className="rounded-2xl border border-emerald-500/20 bg-linear-to-br from-emerald-500/10 via-zinc-950 to-zinc-950 p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-300">
                    <ShieldCheck size={16} />
                    <span className="text-sm font-semibold tracking-wide">Documentation Auth</span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-400">
                    Add credentials when the docs page, Swagger config, or spec URL is protected.
                  </p>
                </div>
                <div className="relative min-w-40">
                  <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-300/80" />
                  <select
                    value={authType}
                    onChange={(e) => setAuthType(e.target.value as AuthType)}
                    className="w-full appearance-none rounded-xl border border-emerald-500/30 bg-zinc-950/90 py-2 pl-9 pr-8 text-sm font-medium text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <option value="none">No Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth</option>
                    <option value="apiKey">Custom Header</option>
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              {authType === 'none' && (
                <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-400">
                  Public documentation selected. If this source later returns `401` or `403`, switch the auth mode here and retry.
                </div>
              )}

              {authType === 'bearer' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-200/80">
                    Bearer Token
                  </label>
                  <input
                    type="password"
                    placeholder="Paste access token"
                    className="w-full rounded-xl border border-emerald-500/25 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono text-sm"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
              )}

              {authType === 'basic' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-200/80">
                    Basic Credentials
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Username"
                      className="w-full rounded-xl border border-emerald-500/25 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all text-sm"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      className="w-full rounded-xl border border-emerald-500/25 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all text-sm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {authType === 'apiKey' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-200/80">
                    Custom Header
                  </label>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <input
                      type="text"
                      placeholder="Header name"
                      className="w-full rounded-xl border border-emerald-500/25 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all text-sm"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="Header value"
                      className="w-full rounded-xl border border-emerald-500/25 bg-zinc-950 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-mono text-sm"
                      value={headerValue}
                      onChange={(e) => setHeaderValue(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

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
        Supported formats: OpenAPI 3.0, 3.1, Swagger 2.0, Postman collections
      </p>
    </div>
  );
}
