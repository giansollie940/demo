/**
 * Which BagPad the page-level keyboard shortcuts go to when focus is on nothing in particular
 * (the page body). The most recently mounted or touched pad wins, so a settings page with two
 * pads never drives both at once.
 */
export const activePad: { current: symbol | null } = { current: null }
