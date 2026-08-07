import { CreateClientForm } from "@/components/forms/create-client-form";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="display text-4xl text-ink">Add client</h1>
        <p className="mt-1 text-ink-soft">
          Sole traders, limited companies, and employers.
        </p>
      </div>
      <div className="panel p-5">
        <CreateClientForm />
      </div>
    </div>
  );
}
