import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

type InboxItem = {
  id: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

type InboxPayload = {
  items: InboxItem[];
  unreadCount: number;
  pendingApprovals?: number;
};

export function NotificationBell({
  csrf,
  onPendingApprovalsChange,
}: {
  csrf: string;
  onPendingApprovalsChange?: (count: number) => void;
}) {
  const fetcher = useFetcher<InboxPayload>();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () => fetcherRef.current.load("/notifications");
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const count = fetcher.data?.pendingApprovals;
    if (typeof count === "number") {
      onPendingApprovalsChange?.(count);
    }
  }, [fetcher.data?.pendingApprovals, onPendingApprovalsChange]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      "a, button, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const unread = fetcher.data?.unreadCount ?? 0;
  const items = fetcher.data?.items ?? [];

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="notification-bell-btn"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 17H9l-1 2h8l-1-2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 ? (
          <span className="notification-badge">{unread}</span>
        ) : null}
      </button>
      {open ? (
        <div
          id="notification-panel"
          className="notification-panel"
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="notification-panel-head">
            <strong>Inbox</strong>
            {unread > 0 ? (
              <fetcher.Form method="post" action="/notifications">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="intent" value="read-all" />
                <button className="text-button" type="submit">
                  Mark all read
                </button>
              </fetcher.Form>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="muted">No notifications yet.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Link to={item.href} onClick={() => setOpen(false)}>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </Link>
                  ) : (
                    <>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </>
                  )}
                  {!item.readAt ? (
                    <fetcher.Form method="post" action="/notifications">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="intent" value="read" />
                      <input type="hidden" name="id" value={item.id} />
                      <button className="text-button" type="submit">
                        Mark read
                      </button>
                    </fetcher.Form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
