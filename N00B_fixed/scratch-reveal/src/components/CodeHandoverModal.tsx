import React, { useState } from 'react';
import { X, Code2, Copy, Check, Terminal, ExternalLink, Layers, Smartphone } from 'lucide-react';

interface CodeHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CodeHandoverModal: React.FC<CodeHandoverModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'react' | 'native' | 'api'>('react');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const reactSnippet = `// NoobSocials Scratch Card Component Drop-in
import React, { useState } from 'react';
import { ScratchCanvas } from './components/ScratchCanvas';
import { SCRATCH_TOOLS } from './utils/scratchEngine';

export const NoobScratchCardView = ({
  post = {
    id: 'post_101',
    imageSrc: 'https://cdn.noobsocials.com/uploads/photo.jpg',
    foil: 'doodle', // 'doodle' | 'silver' | 'gold' | 'holographic'
  },
  onReveal = (percentage) => console.log('Revealed:', percentage),
}) => {
  const [cleared, setCleared] = useState(0);

  return (
    <div className="noob-scratch-wrapper max-w-sm mx-auto p-4 bg-black rounded-3xl border-2 border-white">
      <ScratchCanvas
        imageSrc={post.imageSrc}
        tool={SCRATCH_TOOLS.coin}
        brushMultiplier={1.0}
        foilType={post.foil}
        soundEnabled={true}
        isPeeking={false}
        onPercentageChange={(pct) => {
          setCleared(pct);
          if (pct >= 70) onReveal(pct);
        }}
        resealTrigger={0}
        magicRevealTrigger={0}
      />
    </div>
  );
};`;

  const reactNativeSnippet = `// React Native (Expo / WebView) Handover Wrapper for Noob Socials (iOS & Android)
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export default function NoobSocialsScratchScreen({ route }) {
  const { postId, imageUrl, foilType } = route.params;

  return (
    <View style={styles.container}>
      <WebView
        source={{
          uri: \`https://noobsocials.com/scratch/\${postId}?foil=\${foilType}\`,
        }}
        allowsInlineMediaPlayback
        bounces={false}
        scrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});`;

  const apiSnippet = `// Props & State Architecture Specification
interface NoobScratchCardProps {
  // Underlying mystery media
  imageSrc: string;
  
  // Signature foil texture matching Noob Socials chalkboard theme
  foilType: 'doodle' | 'silver' | 'gold' | 'holographic';
  
  // Scratch tool physics (Coin: 22px, Key: 10px, Pick: 16px, Eraser: 38px, Wand: 28px)
  tool: ScratchTool;
  
  // Web Audio synthesizer for friction scratching
  soundEnabled: boolean;
  
  // Temporary 1.5s X-Ray transparency
  isPeeking: boolean;
  
  // Callback when percentage changes (triggers celebration at >= 72%)
  onPercentageChange: (percent: number) => void;
  onPostRevealed?: () => void;
}`;

  const currentCode =
    activeTab === 'react'
      ? reactSnippet
      : activeTab === 'native'
      ? reactNativeSnippet
      : apiSnippet;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-[#0d0d12] border-2 border-white rounded-3xl shadow-[6px_6px_0px_0px_#ffffff] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b-2 border-white/40 flex items-center justify-between bg-[#121217]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-400 flex items-center justify-center text-purple-300">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-marker text-sm text-white">Dev Handover Package</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400 text-[9px] font-mono">
                  Ready for noobsocials.com
                </span>
              </div>
              <p className="font-doodle text-xs text-zinc-400">
                Single-page modular feature component for iOS, Android & Web
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close handover modal"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white border border-white/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 p-3 bg-black border-b border-white/20 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('react')}
            className={`px-3 py-1.5 rounded-xl border text-xs font-marker transition-all ${
              activeTab === 'react'
                ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            React Web Drop-in
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('native')}
            className={`px-3 py-1.5 rounded-xl border text-xs font-marker transition-all ${
              activeTab === 'native'
                ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 inline mr-1" />
            iOS / Android Integration
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('api')}
            className={`px-3 py-1.5 rounded-xl border text-xs font-marker transition-all ${
              activeTab === 'api'
                ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 inline mr-1" />
            Props API Specs
          </button>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0d]">
          <div className="relative">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-mono border border-white/40 flex items-center gap-1 z-10 shadow"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
            <pre className="p-4 bg-black rounded-2xl border border-zinc-800 text-[11px] font-mono text-zinc-200 overflow-x-auto leading-relaxed">
              <code>{currentCode}</code>
            </pre>
          </div>

          {/* Quick checklist for Noob Socials team */}
          <div className="mt-4 p-3 bg-zinc-900/60 rounded-2xl border border-white/30">
            <h4 className="font-marker text-xs text-white mb-1.5">
              📋 Handover Checklist for noobsocials.com:
            </h4>
            <ul className="text-xs font-doodle text-zinc-300 space-y-1 list-disc list-inside">
              <li>Self-contained HTML5 canvas scratch engine with smooth point interpolation.</li>
              <li>Signature chalkboard doodle theme uses asset <code className="text-amber-300">image_ed31b758.png</code>.</li>
              <li>Synthesized Web Audio API friction effects (zero external MP3 assets required).</li>
              <li>Adaptive touch support with pointer capture for flawless mobile scratching on iOS & Android.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t-2 border-white/40 bg-[#121217] flex items-center justify-between">
          <span className="text-[11px] font-doodle text-zinc-400">
            Designed strictly to the Noob Socials brand guidelines.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white text-black font-marker text-xs rounded-xl border-2 border-white shadow-[2px_2px_0px_0px_#ffffff] active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
