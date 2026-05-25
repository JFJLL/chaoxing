export default function SpaceLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-36 animate-pulse rounded-md bg-slate-100" />
        <div className="h-36 animate-pulse rounded-md bg-slate-100" />
        <div className="h-36 animate-pulse rounded-md bg-slate-100" />
      </div>
    </div>
  );
}
