import React from 'react';

// The list of the NOOB menu, drawn the same way in both places it is used: the three-line menu on a phone (full rows: icon at the left, then the words) and the long
// strip on a tablet / laptop / computer (icons only, or full rows when the strip is extended). Groups have a small heading and a thin line between them.
// The look (dark and light) is in index.css under .nmenu; the icons are the same thin line icons as the bottom bar (they get heavier when the page is the open one).
export interface MenuItemSpec {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** no onClick = not pressable (shown greyed, with its tag: Soon) */
  onClick?: () => void;
  onPointerDown?: () => void;
  /** the page is open now: heavier icon, brighter row */
  active?: boolean;
  /** a number (or word) in an orange circle at the right; in the icon-only strip it is a small orange dot on the icon */
  badge?: number | string;
  /** a small orange dot on the icon, no number */
  dot?: boolean;
  /** a small word after the label (NEW, Soon) */
  tag?: string;
  /** the id the menu remembers when this row is pressed, to come back to it (data-menu-entry, utils/menuReturn.ts) */
  entryId?: string;
  testId?: string;
  /** shown as the tooltip */
  hint?: string;
  danger?: boolean;
}

export interface MenuGroupSpec {
  id: string;
  title?: string;
  items: MenuItemSpec[];
}

const Row: React.FC<{ item: MenuItemSpec; compact: boolean }> = ({ item, compact }) => {
  const showDot = !!item.dot || (compact && item.badge !== undefined && item.badge !== 0 && item.badge !== '');
  const inner = (
    <>
      <span className="nmenu-ico">
        {item.icon}
        {showDot && <span className="nmenu-dot" aria-hidden="true" />}
      </span>
      {!compact && <span className="nmenu-text">{item.label}</span>}
      {!compact && item.tag && <span className="nmenu-tag">{item.tag}</span>}
      {!compact && item.badge !== undefined && item.badge !== 0 && item.badge !== '' && <span className="nmenu-badge">{item.badge}</span>}
    </>
  );
  const cls = `nmenu-item${item.active ? ' is-active' : ''}${compact ? ' is-compact' : ''}${item.danger ? ' is-danger' : ''}`;
  const title = compact ? item.label : item.hint;
  if (!item.onClick) {
    return <div className={`${cls} is-off`} data-menu-entry={item.entryId} data-testid={item.testId} title={title}>{inner}</div>;
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={item.onClick}
      onPointerDown={item.onPointerDown}
      title={title}
      aria-label={item.label}
      aria-current={item.active ? 'page' : undefined}
      data-menu-entry={item.entryId}
      data-testid={item.testId}
    >
      {inner}
    </button>
  );
};

export const MenuList: React.FC<{ groups: MenuGroupSpec[]; compact?: boolean; className?: string }> = ({ groups, compact = false, className = '' }) => (
  <div className={`nmenu-groups ${compact ? 'is-compact' : ''} ${className}`}>
    {groups.filter((g) => g.items.length > 0).map((g) => (
      <div key={g.id} className="nmenu-group" role="group" aria-label={g.title || g.id}>
        {g.title && !compact && <p className="nmenu-label">{g.title}</p>}
        {g.items.map((it) => <Row key={it.id} item={it} compact={compact} />)}
      </div>
    ))}
  </div>
);
