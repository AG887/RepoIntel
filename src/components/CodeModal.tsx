import React, { useState, useMemo } from 'react';
import { X, Copy, Check, FileCode2, Terminal, Layers, ArrowRight, Sparkles, ExternalLink, Search, WrapText, Link2 } from 'lucide-react';
import { GraphNode } from '../types';
import { TYPE_COLORS } from '../data/repositories';
import { extractLinkedLines } from '../utils/linkedLines';

interface CodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: GraphNode | null;
  onAskAI?: (prompt: string) => void;
}

export const CodeModal: React.FC<CodeModalProps> = ({
  isOpen,
  onClose,
  node,
  onAskAI,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [wrapLines, setWrapLines] = useState(false);
  const [viewMode, setViewMode] = useState<'complete' | 'snippet'>('complete');

  const lines = useMemo(() => (node?.codePreview ? node.codePreview.split('\n') : []), [node]);
  const linkedLines = useMemo(() => (node ? extractLinkedLines(node) : []), [node]);

  const highlightedMatchesCount = useMemo(() => {
    if (!searchTerm.trim()) return 0;
    const term = searchTerm.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(term)).length;
  }, [lines, searchTerm]);

  const handleCopy = async () => {
    if (!node) return;
    try {
      await navigator.clipboard.writeText(node.codePreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen || !node) return null;

  const typeConfig = TYPE_COLORS[node.type] || TYPE_COLORS.component;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 md:p-8 animate-in fade-in duration-150">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity" 
        onClick={onClose} 
      />

      {/* Code Window Container */}
      <div 
        id="code-viewer-modal"
        className="relative w-full max-w-5xl h-[90vh] bg-[#090a0f] border border-white/20 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.95)] text-white flex flex-col overflow-hidden z-10 animate-in zoom-in-95 duration-150 font-mono"
      >
        {/* Modal Window Header */}
        <div className="px-5 py-3.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mac-style traffic dots */}
            <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-white/10">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56]/80" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e]/80" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f]/80" />
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <FileCode2 size={16} className="text-blue-400 shrink-0" />
              <h3 className="text-sm font-semibold text-white truncate">
                {node.name}
              </h3>
              <span 
                className="text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider shrink-0"
                style={{ 
                  backgroundColor: `${typeConfig.hex}25`, 
                  color: typeConfig.hex, 
                  border: `1px solid ${typeConfig.hex}40` 
                }}
              >
                {node.type}
              </span>
            </div>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2">
            {/* Quick Find Input */}
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2.5 text-white/40" />
              <input
                type="text"
                placeholder="Find in file..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-7 pr-3 py-1 bg-black/50 border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 w-28 sm:w-40 transition-all"
              />
              {searchTerm && (
                <span className="absolute right-2 text-[10px] text-blue-400">
                  {highlightedMatchesCount}
                </span>
              )}
            </div>

            {/* Line Wrap Toggle */}
            <button
              onClick={() => setWrapLines((prev) => !prev)}
              className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                wrapLines ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
              title="Toggle Line Wrap"
            >
              <WrapText size={14} />
            </button>

            <button
              id="btn-copy-modal-code"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/80 hover:text-white transition-all cursor-pointer"
              title="Copy entire source code"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? 'Copied' : 'Copy All'}</span>
            </button>

            {onAskAI && (
              <button
                onClick={() => {
                  onClose();
                  onAskAI(`Analyze the source code of ${node.name} (${node.path}), highlighting edge cases and performance optimization opportunities.`);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-xs text-blue-300 hover:text-white transition-all cursor-pointer"
                title="Ask AI to analyze this code"
              >
                <Sparkles size={13} />
                <span className="hidden sm:inline">Ask AI</span>
              </button>
            )}

            <button
              id="btn-close-code-modal"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer ml-1"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* File Path & Metrics Sub-Bar with Mode Switcher */}
        <div className="px-5 py-2 border-b border-white/5 bg-black/40 text-[11px] text-white/50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-white/40 truncate text-[11px]">
              {node.path}
            </span>

            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10 text-[10px]">
              <button
                onClick={() => setViewMode('complete')}
                className={`px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'complete'
                    ? 'bg-blue-500/30 text-blue-200 border border-blue-500/40 font-semibold shadow-sm'
                    : 'text-white/40 hover:text-white/80'
                }`}
              >
                <FileCode2 size={12} className="text-blue-400" />
                <span>Complete Code ({lines.length} lines)</span>
              </button>
              <button
                onClick={() => setViewMode('snippet')}
                className={`px-2.5 py-1 rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'snippet'
                    ? 'bg-purple-500/30 text-purple-200 border border-purple-500/40 font-semibold shadow-sm'
                    : 'text-white/40 hover:text-white/80'
                }`}
              >
                <Link2 size={12} className="text-purple-400" />
                <span>Linked Snippet ({linkedLines.length})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-white/60">
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
              100% Complete Source Available
            </span>
            <span>•</span>
            <span className="text-blue-300 font-semibold">{lines.length} lines</span>
            <span>•</span>
            <span>{(((node.sizeBytes || 0)) / 1024).toFixed(1)} KB</span>
            <span>•</span>
            <span className="text-emerald-400 uppercase font-semibold">{node.extension || 'ts'}</span>
          </div>
        </div>

        {/* Code Content Area with Line Numbers */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-4 bg-[#06070a] custom-scrollbar selection:bg-blue-500/40">
          {viewMode === 'complete' ? (
            <div className="flex flex-col font-mono text-[12px] leading-6 min-w-full select-text">
              {lines.map((line, i) => {
                const trimmed = line.trim();
                const isImport = trimmed.startsWith('import') || trimmed.startsWith('export');
                const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
                const isFunction = line.includes('function') || line.includes('const ') || line.includes('=>') || line.includes('class ');
                const isMatchesSearch = searchTerm && line.toLowerCase().includes(searchTerm.toLowerCase());

                let lineClass = 'text-blue-100/90';
                if (isComment) lineClass = 'text-emerald-400/80 italic';
                else if (isImport) lineClass = 'text-purple-300 font-medium';
                else if (isFunction) lineClass = 'text-blue-200 font-medium';

                return (
                  <div 
                    key={i} 
                    className={`flex items-baseline hover:bg-white/[0.05] rounded px-1 group transition-colors ${
                      isMatchesSearch ? 'bg-amber-500/20 text-amber-200 border-l-2 border-amber-400' : ''
                    }`}
                  >
                    <span className="w-12 select-none pr-4 text-right text-white/25 border-r border-white/10 shrink-0 font-mono text-[11px] group-hover:text-white/60">
                      {i + 1}
                    </span>
                    <span className={`pl-4 flex-1 font-mono ${wrapLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${lineClass}`}>
                      {line || '\u00A0'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-2 py-2">
              <div className="text-xs text-white/50 mb-3 px-1 flex items-center justify-between">
                <span>Showing specific lines through which <strong>{node.name}</strong> connects to other modules in the graph:</span>
                <span className="text-purple-300 font-semibold">{linkedLines.length} linked statements</span>
              </div>
              {linkedLines.length > 0 ? (
                linkedLines.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-500/40 transition-colors">
                    <div className="flex items-center justify-between text-[11px] text-white/50 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                          Line {item.lineNum}
                        </span>
                        <span className={`px-2 py-0.5 rounded uppercase font-semibold text-[10px] ${
                          item.type === 'import' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                          item.type === 'export' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                          'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {item.tag}
                        </span>
                      </div>
                      {item.matchedDep && (
                        <span className="text-[10px] text-purple-300/80">
                          Target: {item.matchedDep}
                        </span>
                      )}
                    </div>
                    <pre className="font-mono text-xs text-purple-100/90 whitespace-pre overflow-x-auto pl-2 py-1 bg-black/40 rounded-lg">
                      {item.text}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-sm text-white/40 italic">
                  No direct linkage statements detected. Switch to "Complete Code" to view all lines.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / Direct Dependencies */}
        <div className="px-5 py-2.5 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-[11px] text-white/50 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-white/40 uppercase tracking-widest text-[9px]">Dependencies:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(node.dependencies || []).length > 0 ? (
                (node.dependencies || []).slice(0, 5).map((dep, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-white/70">
                    {dep}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-white/30 italic">No external module dependencies</span>
              )}
              {(node.dependencies || []).length > 5 && (
                <span className="text-[10px] text-white/40">+{(node.dependencies || []).length - 5} more</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-white/40">
            <span>AST Complexity: <strong className="text-white/70">{node.metrics?.complexity ?? 0}/10</strong></span>
            <span>•</span>
            <span>Maintainability: <strong className="text-emerald-400">{node.metrics?.maintainability ?? 100}%</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
