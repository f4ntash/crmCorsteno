import { App as CrmRoutes } from './LegacyCrmApp';

/** Application composition entrypoint. Feature pages are wired by CrmRoutes. */
export function App() {
  return <CrmRoutes />;
}
