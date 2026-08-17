import { useEffect, useRef, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";

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

export function NotificationBell({ csrf }: { csrf: string }) {
  const fetcher = useFetcher<InboxPayload>();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const revalidator = useRevalidator();
  const pendingRef = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => fetcherRef.current.load("/notifications");
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const count = fetcher.data?.pendingApprovals;
    if (
      typeof count === "number" &&
      pendingRef.current !== undefined &&
      pendingRef.current !== count
    ) {
      revalidator.revalidate();
    }
    if (typeof count === "number") pendingRef.current = count;
  }, [fetcher.data?.pendingApprovals, revalidator]);

  const unread = fetcher.data?.unreadCount ?? 0;
  const items = fetcher.data?.items ?? [];

  return (
    <div className="notification-bell">
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifications"
      >
        Notifications
        {unread > 0 ? <span className="badge danger">{unread}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel">
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
