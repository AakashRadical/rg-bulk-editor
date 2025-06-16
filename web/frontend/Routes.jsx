import { Routes as ReactRouterRoutes, Route } from "react-router-dom";
import BillingGuard from "./components/BillingGuard";

export default function Routes({ pages }) {
  const routes = useRoutes(pages);

  const routeComponents = routes.map(({ path, component: Component, requiresBilling }) => {
    const element = requiresBilling
      ? <BillingGuard><Component /></BillingGuard>
      : <Component />;

    return <Route key={path} path={path} element={element} />;
  });

  const NotFound = routes.find(({ path }) => path === "/notFound")?.component;

  return (
    <ReactRouterRoutes>
      {routeComponents}
      <Route path="*" element={NotFound ? <NotFound /> : <div>404 Not Found</div>} />
    </ReactRouterRoutes>
  );
}

function useRoutes(pages) {
  const routes = Object.keys(pages)
    .map((key) => {
      let path = key
        .replace("./pages", "")
        .replace(/\.(t|j)sx?$/, "")
        .replace(/\/index$/i, "/")
        .replace(/\b[A-Z]/, (l) => l.toLowerCase())
        .replace(/\[(?:[.]{3})?(\w+?)\]/g, (_match, param) => `:${param}`);

      if (path.endsWith("/") && path !== "/") {
        path = path.substring(0, path.length - 1);
      }

      const page = pages[key];
      if (!page.default) {
        console.warn(`${key} doesn't export a default React component`);
        return null;
      }

      return {
        path,
        component: page.default,
        requiresBilling: !["/pricing", "/notFound"].includes(path), // ✅ protect everything except these
      };
    })
    .filter(Boolean);

  return routes;
}
