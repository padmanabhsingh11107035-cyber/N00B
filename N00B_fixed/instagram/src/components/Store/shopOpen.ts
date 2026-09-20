// The shop's "accepting orders" switch (owner-controlled). While it is OFF everyone can still browse, use the cart,
// save their details and cancel orders they already placed; only checking out / placing an order is stopped, with
// this message.
export const CLOSED_TITLE = 'Orders are paused';
export const CLOSED_MESSAGE = 'We are not accepting orders for a while.';
export const CLOSED_HINT = 'You can keep browsing and adding items to your cart. Please check back soon.';

// Settings that could not be loaded (or an older settings record without the field) count as OPEN: the database has the
// final say and refuses orders itself when the switch is off.
export const ordersAccepted = (settings?: { storeEnabled?: boolean } | null): boolean => !settings || settings.storeEnabled !== false;

// The database refuses an order with "Ordering is currently paused by NOOB." when the switch is off. Recognise that
// (or any "not accepting orders" wording) so the friendly message is shown instead of a raw error.
// When a shop-settings change is refused, say WHICH account is signed in: a browser keeps one saved login for all its tabs and
// windows, so a screen can still show the admin's buttons while the login that is actually in use belongs to someone else.
export const settingsRefusedMessage = (username?: string | null): string =>
  username
    ? `You are signed in as @${username}, which is not the main NOOB administrator account. Log in as the NOOB account to change the shop settings.`
    : 'Only the main NOOB administrator account can change the shop settings.';

export const isClosedError = (message?: string | null): boolean => /paused|not accepting orders/i.test(message || '');
