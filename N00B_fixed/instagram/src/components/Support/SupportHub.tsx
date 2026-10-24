import React from 'react';
import { ArrowLeft, ChevronRight, Star, X } from 'lucide-react';
import { CallTileIcon, ChatTileIcon, FaqTileIcon, PaymentTileIcon, ReportTileIcon, TicketTileIcon } from './SupportIcons';
import { SUPPORT_TOPICS, type Topic } from './supportTopics';

// The first screen of the help desk, like the "Need help?" screen of a delivery app: a row of coloured tiles (chat, call, FAQs, report, ticket, payment) and the popular topics below.
// Everything it shows is handed in by CustomerSupportModal; this file is only the screen.

export type SupportScreen = 'home' | 'ai_chat' | 'call_us' | 'safety_report' | 'ticket' | 'faq';

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** the round picture shown before the title (the support logo, in the chat) */
  avatar?: string;
  onBack: () => void;
  /** a cross instead of the arrow (the first screen: it leaves the help desk) */
  closeIcon?: boolean;
  right?: React.ReactNode;
}

export const SupportHeader: React.FC<HeaderProps> = ({ title, subtitle, avatar, onBack, closeIcon, right }) => (
  <header className="sd-head" data-testid="support-header">
    <button type="button" className="sd-icon-btn" onClick={onBack} aria-label={closeIcon ? 'Close help' : 'Back'} data-testid="support-back">
      {closeIcon ? <X /> : <ArrowLeft />}
    </button>
    {avatar && <img src={avatar} alt="" className="sd-avatar" />}
    <div className="sd-title">
      <strong>{title}</strong>
      {subtitle && <span><i />{subtitle}</span>}
    </div>
    {right}
  </header>
);

const TILES: Array<{ id: string; label: string; screen?: SupportScreen; action?: 'payment'; Icon: React.FC<{ className?: string }> }> = [
  { id: 'chat', label: 'Chat with us', screen: 'ai_chat', Icon: ChatTileIcon },
  { id: 'call', label: 'Call us', screen: 'call_us', Icon: CallTileIcon },
  { id: 'faq', label: 'FAQs', screen: 'faq', Icon: FaqTileIcon },
  { id: 'report', label: 'Report someone', screen: 'safety_report', Icon: ReportTileIcon },
  { id: 'ticket', label: 'Raise a ticket', screen: 'ticket', Icon: TicketTileIcon },
  { id: 'payment', label: 'Payment help', action: 'payment', Icon: PaymentTileIcon }
];

// the soft colours of the little round pictures in the topic list
const TOPIC_COLOURS: Array<[string, string]> = [['#e8f0fe', '#2563eb'], ['#fef3c7', '#b45309'], ['#e0f7ea', '#0c831f'], ['#fde8f1', '#be185d'], ['#ede9fe', '#6d28d9'], ['#e0f4f6', '#0e7490'], ['#ffedd5', '#c2410c']];

interface HubProps {
  username: string;
  rating: { average: number | null; count: number };
  onOpen: (screen: SupportScreen) => void;
  onPayment: () => void;
  onTopic: (t: Topic) => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

export const SupportHub: React.FC<HubProps> = ({ username, rating, onOpen, onPayment, onTopic, onOpenTerms, onOpenPrivacy }) => {
  const topics = SUPPORT_TOPICS.filter((t) => t.action !== 'payment' && t.action !== 'report');
  return (
    <div className="sd-hub" data-testid="support-hub">
      <div className="sd-hello">
        <h1>Need help?</h1>
        <p>Hi @{username}, how can we help you today?</p>
        {rating.average !== null && (
          <span className="sd-stars"><Star fill="currentColor" /> {rating.average} · {rating.count} review{rating.count === 1 ? '' : 's'}</span>
        )}
      </div>

      <div className="sd-tiles" data-testid="support-tiles">
        {TILES.map(({ id, label, screen, action, Icon }) => (
          <button key={id} type="button" className="sd-tile" onClick={() => (action === 'payment' ? onPayment() : screen && onOpen(screen))} data-testid={`support-tile-${id}`}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <h2 className="sd-section">Popular topics</h2>
      <div className="sd-rows" data-testid="support-topics">
        {topics.map((t, i) => {
          const [bg, fg] = TOPIC_COLOURS[i % TOPIC_COLOURS.length];
          return (
            <button key={t.id} type="button" className="sd-row-btn" onClick={() => onTopic(t)} data-testid="support-topic">
              <span className="sd-row-ic" style={{ background: bg, color: fg }}><t.icon /></span>
              <span className="sd-row-tx"><strong>{t.title}</strong><span>{t.detail}</span></span>
              <ChevronRight className="sd-chev" />
            </button>
          );
        })}
      </div>

      {(onOpenTerms || onOpenPrivacy) && (
        <div className="sd-foot">
          {onOpenTerms && <button type="button" onClick={onOpenTerms}>Terms &amp; Conditions</button>}
          {onOpenTerms && onOpenPrivacy && <span>·</span>}
          {onOpenPrivacy && <button type="button" onClick={onOpenPrivacy}>Privacy Policy</button>}
        </div>
      )}
    </div>
  );
};
