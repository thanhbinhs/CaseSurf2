export default function StepItem({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] ${done ? "bg-primary text-primary-foreground border-transparent" : active ? "bg-muted" : "text-muted-foreground"}`}>
      <span className="font-medium">{label}</span>
    </div>
  );
}
