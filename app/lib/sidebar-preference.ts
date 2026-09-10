export const SIDEBAR_COLLAPSED_KEY = "storeops.sidebar.collapsed";
export const SIDEBAR_COLLAPSED_CLASS = "sidebar-collapsed";

export function readSidebarCollapsed(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(SIDEBAR_COLLAPSED_CLASS);
}

export function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(SIDEBAR_COLLAPSED_CLASS, collapsed);
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "true" : "false");
  } catch {
    /* private mode / blocked storage */
  }
}
