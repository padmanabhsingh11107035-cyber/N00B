import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { StoreProduct } from '../../types';
import { formatPrice } from './formatPrice';
import { LOW_STOCK_AT, hasVariants, totalStock } from './variants';
import { ProductMediaCarousel } from './ProductMediaCarousel';

interface ProductCardProps {
  product: StoreProduct;
  // may edit / delete (shop managers)
  canManage: boolean;
  onOpen: (product: StoreProduct) => void;
  onAddToCart: (product: StoreProduct) => void;
  onEdit: (product: StoreProduct) => void;
  onDelete: (product: StoreProduct) => void;
}

// One product on the shelf: picture, NAME, price and an "Add to cart" button. The description only appears when the
// product is opened. The card lights up when the mouse is over it (or it is tapped/focused).
export const ProductCard: React.FC<ProductCardProps> = ({ product, canManage, onOpen, onAddToCart, onEdit, onDelete }) => {
  const soldOut = !product.inStock;
  const units = totalStock(product);
  const needsChoice = hasVariants(product);

  return (
    <div
      className="group relative rounded-2xl p-3 sm:p-4 border border-zinc-800 bg-zinc-900/50 hover:bg-gradient-to-b hover:from-[#0891b2] hover:to-[#0e7490] hover:border-cyan-400/60 hover:shadow-[0_12px_30px_-8px_rgba(8,145,178,0.55)] hover:-translate-y-0.5 focus-within:border-cyan-400/60 transition-all duration-200 flex flex-col text-center"
    >
      <button type="button" onClick={() => onOpen(product)} className="flex-1 flex flex-col items-center text-center cursor-pointer" aria-label={`Open ${product.title}`}>
        <div className="w-full aspect-square rounded-xl overflow-hidden bg-zinc-900/80 relative">
          {/* the product's pictures turn by themselves and loop: after the last one it starts again from the first */}
          <ProductMediaCarousel media={product.media} className="group-hover:scale-105 transition-transform duration-300" />
          {soldOut && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-[10px] font-bold text-red-400 bg-black/70 px-2 py-1 rounded-full">Out of Stock</span>
            </div>
          )}
          {!soldOut && units !== null && units <= LOW_STOCK_AT && (
            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold text-amber-300 bg-black/70 px-2 py-0.5 rounded-full">Only {units} left</span>
          )}
        </div>
        <h3 className="mt-3 text-sm sm:text-[15px] font-black text-white leading-snug line-clamp-2">{product.title}</h3>
        <span className="mt-1 text-sm sm:text-base font-black text-[#00FF66] group-hover:text-white transition-colors">{formatPrice(product.price)}</span>
        {product.options.length > 0 && (
          <span className="mt-0.5 text-[10px] text-zinc-500 group-hover:text-cyan-100 truncate max-w-full">{product.options.map((o) => o.name).join(' · ')}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => (needsChoice ? onOpen(product) : onAddToCart(product))}
        disabled={soldOut}
        className="mt-3 mx-auto px-5 py-1.5 rounded-full border-2 border-amber-400 text-amber-400 text-[10px] sm:text-[11px] font-black tracking-wider uppercase cursor-pointer hover:bg-amber-400 hover:text-black group-hover:bg-amber-400 group-hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-amber-400 disabled:group-hover:bg-transparent disabled:group-hover:text-amber-400"
      >
        {soldOut ? 'Out of stock' : needsChoice ? 'Choose options' : 'Add to cart'}
      </button>

      {canManage && (
        <div className="absolute top-2 right-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(product); }}
            className="p-1.5 rounded-full bg-black/70 hover:bg-[#00FF66]/80 cursor-pointer"
            aria-label="Edit product"
            title="Edit product"
          >
            <Pencil className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(product); }}
            className="p-1.5 rounded-full bg-black/70 hover:bg-red-500/80 cursor-pointer"
            aria-label="Delete product"
            title="Delete product"
          >
            <Trash2 className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
};
