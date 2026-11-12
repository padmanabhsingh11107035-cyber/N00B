import { fetchRepostStates } from '../services/api';
import { createRepostBatcher } from './repostBatcher';

// The one batcher the whole app shares (RepostButton on cards and reels, the share sheet, the story viewer).
export const repostStates = createRepostBatcher(async (kind, ids) => fetchRepostStates(kind, ids));
