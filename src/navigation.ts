// Four screens and no deep links needed, so a tiny stack instead of a navigation library.
export type Route =
  | { name: 'home' }
  | { name: 'token' }
  | { name: 'activity' }
  | { name: 'claim'; asset: string }
  | { name: 'claimStatus'; key: string };

export type Nav = {
  go: (r: Route) => void;
  back: () => void;
  reset: (r: Route) => void;
};
