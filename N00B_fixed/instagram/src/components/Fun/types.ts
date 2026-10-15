import type { User } from '../../types';
import type { FunLocation } from '../../utils/funRoutes';

/** What every Fun page receives from the shell. */
export interface FunPageProps {
  /** null for a visitor who is not logged in: they can read what is public; the page asks them to log in for the rest */
  currentUser: User | null;
  /** Ask: the username whose page is open. Polls: the id of the poll that is open. */
  target?: string;
  onLogin?: () => void;
  onOpenProfile?: (user: User) => void;
  /** move to another Fun page (or another person's Ask page / another poll) */
  onOpenFeature: (loc: FunLocation) => void;
}
