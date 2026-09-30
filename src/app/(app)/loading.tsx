export default function AppLoading() {
  return (
    <div className="animate-fade-up space-y-6 max-w-cockpit" aria-busy="true" aria-label="Loading">
      <div className="space-y-3">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-8 w-2/3 max-w-md rounded-xl" />
        <div className="skeleton h-4 w-full max-w-lg rounded-lg" />
      </div>
      <div className="skeleton h-14 w-full max-w-sm rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="skeleton h-36 rounded-2xl" />
        <div className="skeleton h-36 rounded-2xl" />
      </div>
      <div className="skeleton h-48 rounded-2xl" />
      <p className="text-sm text-dim m-0">Loading…</p>
    </div>
  );
}
