export type DeviceFrameType = 'ios' | 'android' | 'desktop';

export interface ScratchPost {
  id: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  title: string;
  hint: string;
  imageSrc: string;
  timestamp: string;
  likes: number;
  thumbsUp: number;
  flames: number;
  rockets: number;
  skulls: number;
  commentsCount: number;
  comments: Array<{
    id: string;
    author: string;
    avatar: string;
    text: string;
    time: string;
  }>;
  category: string;
}

export type BrushSize = 'small' | 'medium' | 'large';
