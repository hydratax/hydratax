export default function ClientWorkspaceLoading() {
  return (
    <div className="animate-pulse space-y-4 pt-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel h-24 bg-white/60" />
        <div className="panel h-24 bg-white/60" />
        <div className="panel h-24 bg-white/60" />
      </div>
      <div className="panel h-48 bg-white/60" />
      <div className="panel h-64 bg-white/60" />
    </div>
  );
}
