import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, ShoppingCart } from 'lucide-react';
import { StoreProduct } from '../../types';
import { formatPrice } from './formatPrice';

interface ProductDetailModalProps {
  product: StoreProduct;
  onClose: () => void;
  onAddToCart: (productId: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onAddToCart }) => {
  const [slide, setSlide] = useState(0);
  const media = product.media;

  return (
    <div className="fixed inset-0 z-[105] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="relative w-full aspect-square bg-zinc-900">
          {media[slide]?.type === 'video' ? (
            <video src={media[slide].url} className="w-full h-full object-cover" controls autoPlay muted loop />
          ) : (
            <img src={media[slide]?.url} alt="" className="w-full h-full object-cover" />
          )}
          <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4 text-white" />
          </button>
          {media.length > 1 && (
            <>
              <button
                onClick={() => setSlide((s) => (s === 0 ? media.length - 1 : s - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/75 cursor-pointer"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setSlide((s) => (s === media.length - 1 ? 0 : s + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 hover:bg-black/75 cursor-pointer"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {media.map((_, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === slide ? 'bg-white' : 'bg-white/40'}`} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-xl font-black text-[#00FF66]">{formatPrice(product.price)}</span>
            {product.inStock ? (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-full shrink-0">In Stock</span>
            ) : (
              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-full shrink-0">Out of Stock</span>
            )}
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{product.description}</p>

          <button
            onClick={() => onAddToCart(product.id)}
            disabled={!product.inStock}
            className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" /> Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
};
