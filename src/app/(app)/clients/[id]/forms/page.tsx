import { FormsAndLettersWorkspace } from "@/components/forms/forms-and-letters-workspace";
import { listClientOnboardingForms } from "@/server/actions/onboarding-forms";
import { listClientLetters } from "@/server/actions/client-letters";
import { getPracticeLetterhead } from "@/server/actions/letterhead";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function ClientFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, clientId, slug } = await loadClientPage(ref, "forms");
  const [forms, letters, letterhead] = await Promise.all([
    listClientOnboardingForms(clientId),
    listClientLetters(clientId),
    getPracticeLetterhead(),
  ]);

  return (
    <FormsAndLettersWorkspace
      clientId={clientId}
      clientSlug={slug}
      contactEmail={client.contactEmail ?? null}
      initialForms={forms}
      initialLetters={letters}
      letterhead={letterhead}
    />
  );
}
