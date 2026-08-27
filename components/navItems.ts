// The site's three destinations, shared by the desktop sidebar and the mobile
// nav row so the two can't drift apart.
//
// Icon paths came from the design handoff's nav list — see
// design_handoff_screener_redesign/README.md "Sidebar" section. Two of its five
// entries are gone: "stock detail" had no route to point at and "account"
// pointed at a login page every visitor has already passed.
export const NAV_ITEMS = [
  { id: "dashboard", href: "/", icon: "M3.5 10 10 4l6.5 6M5.5 9v7h9V9", match: (p: string) => p === "/" },
  { id: "backtest", href: "/backtest", icon: "M4 16V8m4 8V4m4 12v-6m4 6V6", match: (p: string) => p.startsWith("/backtest") },
  {
    id: "myPage",
    href: "/mypage",
    icon: "M10 16.5S3.8 12.4 3.8 8A3.6 3.6 0 0 1 10 5.6 3.6 3.6 0 0 1 16.2 8c0 4.4-6.2 8.5-6.2 8.5Z",
    match: (p: string) => p.startsWith("/mypage"),
  },
] as const;
