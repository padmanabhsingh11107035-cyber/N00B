import React, { useState } from 'react';
import { Check, Coins, Palette, Sparkles, X } from 'lucide-react';
import { DiceSkin, ThemeConfig, TokenSkin } from '../types';
import { soundEffects } from '../audio/soundEffects';
import { ludoStorage, UserProfile } from '../services/ludoStorage';
import { DICE_SKINS, LUDO_THEMES, TOKEN_SKINS } from '../themes/ludoThemes';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onProfileUpdated: (updated: UserProfile) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  profile,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'themes' | 'dice' | 'tokens'>('themes');

  if (!isOpen) return null;

  const handleEquip = (type: 'theme' | 'dice' | 'token', id: string) => {
    soundEffects.playButtonClick();
    ludoStorage.equipItem(type, id);
    onProfileUpdated(ludoStorage.getProfile());
  };

  const handleBuy = (type: 'theme' | 'dice' | 'token', id: string) => {
    soundEffects.playButtonClick();
    const success = ludoStorage.purchaseItem(type, id);
    if (success) {
      soundEffects.playHomeReached();
      onProfileUpdated(ludoStorage.getProfile());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 border border-indigo-500/40 rounded-3xl p-5 md:p-6 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-black text-white">THEMES & SKINS</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Coin balance */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 border border-amber-400/40 rounded-full text-amber-300 font-black text-xs">
              <Coins className="w-3.5 h-3.5" />
              <span>{profile.coins.toLocaleString()}</span>
            </div>

            <button
              onClick={() => {
                soundEffects.playButtonClick();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-3 gap-2 my-4 p-1 rounded-2xl bg-slate-950 border border-slate-800">
          {(
            [
              { id: 'themes', label: 'Board Themes' },
              { id: 'dice', label: 'Dice Styles' },
              { id: 'tokens', label: 'Token Skins' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                soundEffects.playButtonClick();
                setActiveTab(tab.id);
              }}
              className={`py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Themes Grid */}
        {activeTab === 'themes' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {LUDO_THEMES.map((theme) => {
              const isUnlocked = profile.unlockedThemeIds.includes(theme.id);
              const isEquipped = profile.equippedThemeId === theme.id;

              return (
                <div
                  key={theme.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isEquipped
                      ? 'bg-indigo-950/70 border-indigo-400 shadow-lg'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-white text-sm">
                      {theme.name}
                    </span>
                    {isEquipped && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                        <Check className="w-3 h-3" /> EQUIPPED
                      </span>
                    )}
                  </div>

                  {/* Theme Color Preview Swatch */}
                  <div
                    className="h-12 w-full rounded-xl border border-white/10 flex items-center justify-around px-2 mb-3 shadow-inner"
                    style={{ backgroundColor: theme.boardBg }}
                  >
                    <div className="w-5 h-5 rounded-full bg-red-500 shadow" />
                    <div className="w-5 h-5 rounded-full bg-emerald-500 shadow" />
                    <div className="w-5 h-5 rounded-full bg-amber-500 shadow" />
                    <div className="w-5 h-5 rounded-full bg-blue-500 shadow" />
                  </div>

                  {/* Action Button */}
                  {isUnlocked ? (
                    <button
                      onClick={() => handleEquip('theme', theme.id)}
                      disabled={isEquipped}
                      className={`w-full py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isEquipped
                          ? 'bg-slate-800 text-slate-400 opacity-60'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                      }`}
                    >
                      {isEquipped ? 'EQUIPPED' : 'EQUIP THEME'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy('theme', theme.id)}
                      disabled={profile.coins < theme.price}
                      className="w-full py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5 fill-current" />
                      <span>UNLOCK ({theme.price} COINS)</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Dice Skins */}
        {activeTab === 'dice' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DICE_SKINS.map((dice) => {
              const isUnlocked = profile.unlockedDiceSkinIds.includes(dice.id);
              const isEquipped = profile.equippedDiceSkinId === dice.id;

              return (
                <div
                  key={dice.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isEquipped
                      ? 'bg-indigo-950/70 border-indigo-400 shadow-lg'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-white text-sm">{dice.name}</span>
                    {isEquipped && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                        <Check className="w-3 h-3" /> EQUIPPED
                      </span>
                    )}
                  </div>

                  <div className="h-16 flex items-center justify-center mb-3">
                    <div
                      className="w-12 h-12 rounded-xl border-2 border-white/80 shadow-lg flex items-center justify-center"
                      style={{
                        backgroundColor: dice.primaryColor,
                        boxShadow: `0 0 15px ${dice.edgeGlow}`,
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: dice.dotColor }}
                      />
                    </div>
                  </div>

                  {isUnlocked ? (
                    <button
                      onClick={() => handleEquip('dice', dice.id)}
                      disabled={isEquipped}
                      className={`w-full py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isEquipped
                          ? 'bg-slate-800 text-slate-400 opacity-60'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                      }`}
                    >
                      {isEquipped ? 'EQUIPPED' : 'EQUIP DICE'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy('dice', dice.id)}
                      disabled={profile.coins < dice.price}
                      className="w-full py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5 fill-current" />
                      <span>UNLOCK ({dice.price} COINS)</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Token Skins */}
        {activeTab === 'tokens' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TOKEN_SKINS.map((token) => {
              const isUnlocked = profile.unlockedTokenSkinIds.includes(token.id);
              const isEquipped = profile.equippedTokenSkinId === token.id;

              return (
                <div
                  key={token.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isEquipped
                      ? 'bg-indigo-950/70 border-indigo-400 shadow-lg'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-extrabold text-white text-sm">{token.name}</span>
                    {isEquipped && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-black flex items-center gap-1">
                        <Check className="w-3 h-3" /> EQUIPPED
                      </span>
                    )}
                  </div>

                  <div className="h-16 flex items-center justify-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-red-500 border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-black">
                      1
                    </div>
                    <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-black">
                      2
                    </div>
                  </div>

                  {isUnlocked ? (
                    <button
                      onClick={() => handleEquip('token', token.id)}
                      disabled={isEquipped}
                      className={`w-full py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isEquipped
                          ? 'bg-slate-800 text-slate-400 opacity-60'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow'
                      }`}
                    >
                      {isEquipped ? 'EQUIPPED' : 'EQUIP SKIN'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy('token', token.id)}
                      disabled={profile.coins < token.price}
                      className="w-full py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-all flex items-center justify-center gap-1.5 shadow cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5 fill-current" />
                      <span>UNLOCK ({token.price} COINS)</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
