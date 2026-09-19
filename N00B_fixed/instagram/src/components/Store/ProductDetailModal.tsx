import React, { useEffect, useState } from 'react';
import { X, ArrowLeft, ChevronLeft, ChevronRight, ShoppingCart, Pencil } from 'lucide-react';
import { StoreProduct } from '../../types';
import { formatPrice } from './formatPrice';
import { defaultSelection, hasVariants, isBuyable, optionHasStock, stockLabel, variantKeyFor } from './variants';

interface ProductDetailModalProps {
  product: StoreProduct;
  onClose: () => void;
  // variantKey is set when the product comes in versions (colour / size / model ...)
  onAddToCart: (productId: string, variantKey?: string | null) => void;
  // shown only to people who may manage the shop
  onEdit?: (product: StoreProduct) => void;
}

const TONE: Record<'ok' | 'low' | 'out', string> = {
  ok: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  low: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  out: 'text-red-400 bg-red-500/10 border-red-500/30'
};

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onAddToCart, onEdit }) => {
  const [slide, setSlide] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>(() => defaultSelection(product));
  const media = product.media;
  const versions = hasVariants(product);
  const variantKey = versions ? variantKeyFor(product.options, selected) : null;
  const buyable = isBuyable(product, variantKey);
  const stock = stockLabel(product, variantKey);

  // Esc goes back to the shop, like the arrow
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[105] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[94vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl">
        <div className="relative w-full aspect-square bg-zinc-900">
          {media[slide]?.type === 'video' ? (
            <video src={media[slide].url} className="w-full h-full object-cover" controls autoPlay muted loop />
          ) : (
            <img src={media[slide]?.url} alt="" className="w-full h-full object-cover" />
          )}
          {/* Back to the shop */}
          <button
            onClick={onClose}
            className="absolute top-3 left-3 p-2 rounded-full bg-black/60 hover:bg-black/80 cursor-pointer"
            aria-label="Back to the shop"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {onEdit && (
              <button
                onClick={() => onEdit(product)}
                className="p-2 rounded-full bg-black/60 hover:bg-black/80 cursor-pointer"
                aria-label="Edit product"
                title="Edit product"
              >
                <Pencil className="w-4 h-4 text-[#00FF66]" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-full bg-black/60 hover:bg-black/80 cursor-pointer" aria-label="Close">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
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
            <span className={`text-[10px] font-bold border px-2 py-1 rounded-full shrink-0 ${TONE[stock.tone]}`}>{stock.text}</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{product.description}</p>

          {/* Versions: colour, size, model ... */}
          {versions && product.options.map((o) => (
            <div key={o.name} className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400 uppercase">
                {o.name}: <span className="text-white normal-case">{selected[o.name]}</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {o.values.map((value) => {
                  const active = selected[o.name] === value;
                  const available = optionHasStock(product, selected, o.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelected((prev) => ({ ...prev, [o.name]: value }))}
                      aria-pressed={active}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                        active
                          ? 'border-[#00FF66] bg-[#00FF66]/15 text-[#00FF66]'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500'
                      } ${available ? '' : 'opacity-50 line-through'}`}
                      title={available ? undefined : 'Sold out in this combination'}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <button
            onClick={() => onAddToCart(product.id, variantKey)}
            disabled={!buyable}
            className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" /> {buyable ? 'Add to Cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </div>
  );
};
