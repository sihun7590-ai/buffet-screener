import SidebarNav from "./SidebarNav";

// The sidebar's nav, relocated to a row under the header on phones and
// tablets. Sticks below the 64px header so it stays reachable while scrolling
// a 500-row screener, and scrolls sideways rather than wrapping to a second
// line if a translation ever runs long.
export default function MobileNav() {
  return (
    <div className="sticky top-16 z-20 flex items-center overflow-x-auto border-b border-sidebar-border bg-[rgba(8,8,11,0.88)] px-3 py-2 backdrop-blur-[14px] lg:hidden">
      <SidebarNav orientation="horizontal" />
    </div>
  );
}
