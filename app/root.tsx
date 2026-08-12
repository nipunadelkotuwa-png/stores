import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
  },
];

export const meta: Route.MetaFunction = () => [
  { title: "StoreOps | DS Gunasekara Group" },
  { name: "description", content: "Bus spare-parts inventory management" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      message = "Page not found";
      details = "The requested page could not be found.";
    } else if (error.status === 403) {
      message = "Access denied";
      details =
        typeof error.data === "string"
          ? error.data
          : typeof error.data === "object" &&
              error.data &&
              "message" in error.data &&
              typeof (error.data as { message?: unknown }).message === "string"
            ? (error.data as { message: string }).message
            : "You do not have permission to view this page.";
    } else {
      message = `Error ${error.status}`;
      details = error.statusText || details;
    }
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">StoreOps</p>
        <h1>{message}</h1>
        <p className="muted">{details}</p>
        <p>
          <a className="button button-primary" href="/">
            Back to dashboard
          </a>
        </p>
        {stack ? (
          <pre className="w-full p-4 overflow-x-auto">
            <code>{stack}</code>
          </pre>
        ) : null}
      </section>
    </main>
  );
}
