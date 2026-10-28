import { createRoot } from 'react-dom/client';
import { LensApp } from './LensApp.tsx';
import './lens.css';

// NOOB Lenses starts here (lenses.html). It is its own small page: the app itself is not loaded.
createRoot(document.getElementById('root') as HTMLElement).render(<LensApp />);
