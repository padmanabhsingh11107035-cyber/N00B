import React from 'react';

export const DoodleBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Pattern texture overlay from reference asset */}
      <div
        className="absolute inset-0 opacity-15 bg-repeat bg-[length:380px_auto]"
        style={{
          backgroundImage: `url('/assets/foil/image_ed31b758.png')`,
        }}
      />

      {/* Chalkboard radial vignette */}
      <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_0%,rgba(0,0,0,0.85)_85%]" />

      {/* Subtle floating chalk sparks */}
      <div className="absolute top-12 left-10 text-white/20 text-3xl font-doodle select-none animate-pulse">
        ✦
      </div>
      <div className="absolute top-1/3 right-12 text-white/25 text-4xl font-doodle select-none">
        ★
      </div>
      <div className="absolute bottom-20 left-16 text-white/20 text-2xl font-doodle select-none">
        ~ scratch me ~
      </div>
      <div className="absolute bottom-1/4 right-20 text-white/20 text-3xl font-doodle select-none animate-bounce">
        ✨
      </div>
    </div>
  );
};
