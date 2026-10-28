import { createRoot } from 'react-dom/client';
import BuddyBooth from './BuddyBooth.tsx';

// The Buddy Booth as a page of its own (booth.html, the address /booth): the app, the login and the database are not loaded, so it works even when NOOB itself is down. Everything the booth
// does happens on the device. Without the app there is no Story / Post / Reel creator to hand the picture to: the picture is saved or shared instead (no `onUse`).
createRoot(document.getElementById('root') as HTMLElement).render(<BuddyBooth onClose={() => { window.location.assign('/'); }} />);
