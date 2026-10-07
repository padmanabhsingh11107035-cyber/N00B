import React from 'react';
import { PieceColor, PieceStyleId, PieceType } from './types';

interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  pieceStyle?: PieceStyleId;
  className?: string;
}

export const ChessPiece: React.FC<ChessPieceProps> = ({
  type,
  color,
  pieceStyle = 'classic',
  className = 'w-full h-full',
}) => {
  const isWhite = color === 'w';

  // Palette customization based on piece style
  let fill = isWhite ? '#ffffff' : '#111827';
  let stroke = isWhite ? '#1f2937' : '#030712';
  let accent = isWhite ? '#e5e7eb' : '#374151';

  if (pieceStyle === 'modern') {
    fill = isWhite ? '#f8fafc' : '#1e1b4b';
    stroke = isWhite ? '#64748b' : '#312e81';
    accent = isWhite ? '#cbd5e1' : '#4338ca';
  } else if (pieceStyle === 'minimal') {
    fill = isWhite ? '#f1f5f9' : '#0f172a';
    stroke = isWhite ? '#475569' : '#1e293b';
    accent = isWhite ? '#e2e8f0' : '#1e293b';
  } else if (pieceStyle === 'neon') {
    fill = isWhite ? '#e0f2fe' : '#0284c7';
    stroke = isWhite ? '#38bdf8' : '#0369a1';
    accent = isWhite ? '#bae6fd' : '#075985';
  } else if (pieceStyle === 'wood') {
    fill = isWhite ? '#fdf6e2' : '#3e2723';
    stroke = isWhite ? '#8d6e63' : '#1b0000';
    accent = isWhite ? '#d7ccc8' : '#4e342e';
  }

  const renderPiecePath = () => {
    switch (type) {
      case 'p': // Pawn
        return (
          <g>
            <circle cx="22.5" cy="12" r="6" fill={fill} stroke={stroke} strokeWidth="1.5" />
            <path
              d="M17 18 C17 25 14 28 14 34 L31 34 C31 28 28 25 28 18 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
            />
            <rect x="12" y="34" width="21" height="4" rx="2" fill={accent} stroke={stroke} strokeWidth="1.5" />
            <rect x="10" y="38" width="25" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
          </g>
        );

      case 'n': // Knight
        return (
          <g>
            <path
              d="M14 39 L31 39 L31 36 C31 36 30 32 32 30 C34 27 34 23 33 19 C32 15 29 11 25 9 C24 8 23 8 22 9 C22 9 20 8 19 8 C17 9 16 11 15 13 C14 15 14 17 15 19 C14 19 12 19 11 21 C10 23 10 26 12 28 C14 29 16 28 18 27 C17 30 16 33 14 36 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="20" cy="14" r="1.5" fill={stroke} />
            <path d="M13 23 L16 22" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
            <path d="M24 16 L28 19" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
            <rect x="12" y="38" width="21" height="4" rx="2" fill={accent} stroke={stroke} strokeWidth="1.5" />
          </g>
        );

      case 'b': // Bishop
        return (
          <g>
            <circle cx="22.5" cy="8.5" r="2.5" fill={accent} stroke={stroke} strokeWidth="1.2" />
            <path
              d="M16 35 C16 30 14 26 17 20 C18 17 20 12 22.5 12 C25 12 27 17 28 20 C31 26 29 30 29 35 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
            />
            <path d="M20 18 L26 24" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
            <ellipse cx="22.5" cy="27" rx="5" ry="2" fill={accent} />
            <rect x="13" y="35" width="19" height="3" rx="1.5" fill={accent} stroke={stroke} strokeWidth="1.5" />
            <rect x="11" y="38" width="23" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
          </g>
        );

      case 'r': // Rook
        return (
          <g>
            <path
              d="M13 14 L13 19 L17 19 L17 16 L21 16 L21 19 L24 19 L24 16 L28 16 L28 19 L32 19 L32 14 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="M15 19 L16 34 L29 34 L30 19 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
            />
            <line x1="16" y1="26" x2="29" y2="26" stroke={accent} strokeWidth="2" />
            <rect x="13" y="34" width="19" height="4" rx="2" fill={accent} stroke={stroke} strokeWidth="1.5" />
            <rect x="11" y="38" width="23" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
          </g>
        );

      case 'q': // Queen
        return (
          <g>
            <circle cx="10" cy="14" r="2" fill={accent} stroke={stroke} strokeWidth="1" />
            <circle cx="16" cy="11" r="2" fill={accent} stroke={stroke} strokeWidth="1" />
            <circle cx="22.5" cy="9" r="2.2" fill={accent} stroke={stroke} strokeWidth="1" />
            <circle cx="29" cy="11" r="2" fill={accent} stroke={stroke} strokeWidth="1" />
            <circle cx="35" cy="14" r="2" fill={accent} stroke={stroke} strokeWidth="1" />
            <path
              d="M10 16 L14 26 L17 13 L22.5 25 L28 13 L31 26 L35 16 C35 24 33 32 30 35 L15 35 C12 32 10 24 10 16 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <ellipse cx="22.5" cy="29" rx="6" ry="2.5" fill={accent} stroke={stroke} strokeWidth="1" />
            <rect x="13" y="35" width="19" height="3" rx="1.5" fill={accent} stroke={stroke} strokeWidth="1.5" />
            <rect x="10" y="38" width="25" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
          </g>
        );

      case 'k': // King
        return (
          <g>
            <path d="M22.5 7 L22.5 13" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
            <path d="M19.5 9.5 L25.5 9.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
            <path
              d="M15 16 C15 13 18 13 22.5 13 C27 13 30 13 30 16 C33 21 32 29 29 35 L16 35 C13 29 12 21 15 16 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.5"
            />
            <path d="M17 19 C20 22 25 22 28 19" fill="none" stroke={stroke} strokeWidth="1.5" />
            <ellipse cx="22.5" cy="28" rx="6" ry="2.5" fill={accent} stroke={stroke} strokeWidth="1.5" />
            <rect x="13" y="35" width="19" height="3" rx="1.5" fill={accent} stroke={stroke} strokeWidth="1.5" />
            <rect x="10" y="38" width="25" height="4" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
          </g>
        );

      default:
        return null;
    }
  };

  return (
    <svg
      viewBox="0 0 45 45"
      className={`${className} drop-shadow-md transition-transform duration-150`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {renderPiecePath()}
    </svg>
  );
};
