import React from 'react';
import { Smartphone, Tablet, Monitor, Wifi, Battery, Signal } from 'lucide-react';
import { DeviceFrameType } from '../types/scratch';

interface DeviceFrameProps {
  deviceType: DeviceFrameType;
  onChangeDevice: (device: DeviceFrameType) => void;
  children: React.ReactNode;
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({
  deviceType,
  onChangeDevice,
  children,
}) => {
  return (
    <div className="w-full flex flex-col items-center">
      {/* Device Switcher Controls Bar */}
      <div className="flex items-center gap-2 p-1.5 bg-[#121217] rounded-2xl border-2 border-white shadow-[3px_3px_0px_0px_#ffffff] mb-4 select-none">
        <span className="text-[10px] font-marker uppercase text-zinc-400 px-2">
          Preview On:
        </span>

        {/* Button 29: iOS Frame Button */}
        <button
          type="button"
          aria-label="Preview in iOS iPhone Frame"
          title="Apple iPhone 16 Pro Viewport"
          onClick={() => onChangeDevice('ios')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-marker transition-all ${
            deviceType === 'ios'
              ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
              : 'bg-black text-zinc-300 border-zinc-700 hover:border-white'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>iOS</span>
        </button>

        {/* Button 30: Android Frame Button */}
        <button
          type="button"
          aria-label="Preview in Android Galaxy Frame"
          title="Samsung Galaxy S25 Android Viewport"
          onClick={() => onChangeDevice('android')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-marker transition-all ${
            deviceType === 'android'
              ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
              : 'bg-black text-zinc-300 border-zinc-700 hover:border-white'
          }`}
        >
          <Tablet className="w-3.5 h-3.5" />
          <span>Android</span>
        </button>

        {/* Button 31: Desktop Fullscreen Button */}
        <button
          type="button"
          aria-label="Preview in Expanded Web Studio View"
          title="Full Page Layout"
          onClick={() => onChangeDevice('desktop')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 text-xs font-marker transition-all ${
            deviceType === 'desktop'
              ? 'bg-white text-black border-white shadow-[2px_2px_0px_0px_#ffffff]'
              : 'bg-black text-zinc-300 border-zinc-700 hover:border-white'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Full Web</span>
        </button>
      </div>

      {/* Frame Container */}
      {deviceType === 'desktop' ? (
        <div className="w-full max-w-xl mx-auto px-4 pb-12 transition-all duration-300">
          {children}
        </div>
      ) : (
        <div
          className={`relative w-full max-w-[420px] mx-auto sm:rounded-[46px] sm:p-3.5 sm:border-4 transition-all duration-300 ${
            deviceType === 'ios'
              ? 'bg-[#18181b] sm:border-zinc-700 sm:shadow-[0_25px_60px_-15px_rgba(255,255,255,0.15)] sm:ring-1 sm:ring-white/30'
              : 'bg-[#18181b] sm:border-zinc-800 sm:shadow-[0_25px_60px_-15px_rgba(255,255,255,0.15)] sm:ring-1 sm:ring-white/20'
          }`}
        >
          {/* iOS Dynamic Island or Android Punch Hole */}
          {deviceType === 'ios' ? (
            <div className="relative pt-2 pb-1 px-4 flex items-center justify-between text-white text-[11px] font-medium select-none z-30">
              <span>9:41</span>
              {/* Dynamic Island Pill */}
              <div className="w-24 h-5 bg-black rounded-full border border-zinc-800 flex items-center justify-end px-2">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-900 border border-zinc-700" />
              </div>
              <div className="flex items-center gap-1.5">
                <Signal className="w-3 h-3" />
                <Wifi className="w-3 h-3" />
                <Battery className="w-3.5 h-3.5" />
              </div>
            </div>
          ) : (
            <div className="relative pt-2 pb-1 px-4 flex items-center justify-between text-white text-[11px] font-medium select-none z-30">
              <span>10:30</span>
              {/* Android Center Camera Hole */}
              <div className="w-3.5 h-3.5 rounded-full bg-black border border-zinc-800 shadow-inner" />
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold">5G</span>
                <Wifi className="w-3 h-3" />
                <Battery className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* Screen Content Wrapper with mobile scroll */}
          <div className="relative w-full max-h-[760px] overflow-y-auto scrollbar-none bg-black rounded-[36px] p-3.5 border border-white/20">
            {children}
          </div>

          {/* Bottom Navigation Indicator */}
          {deviceType === 'ios' ? (
            <div className="w-32 h-1 bg-white/40 rounded-full mx-auto mt-2.5 mb-1" />
          ) : (
            <div className="w-20 h-1 bg-white/30 rounded-full mx-auto mt-2.5 mb-1" />
          )}
        </div>
      )}
    </div>
  );
};
