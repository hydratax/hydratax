import { getClient } from "@/server/actions/clients";
import { getPracticeLetterhead } from "@/server/actions/letterhead";
import { requireSession } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { renderClientLetterHtml } from "@/lib/letters/render-letter-html";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; letterId: string }> },
) {
  await requireSession();
  const { id: ref, letterId } = await context.params;
  const { clientId } = await loadClientPage(ref, "forms");
  const client = await getClient(clientId);
  if (!client) {
    return new Response("Client not found", { status: 404 });
  }

  const letter = (client.deskProfile?.clientLetters ?? []).find(
    (l) => l.id === letterId,
  );
  if (!letter) {
    return new Response("Letter not found", { status: 404 });
  }

  const letterhead = await getPracticeLetterhead();
  const url = new URL(request.url);
  const autoPrint = url.searchParams.get("print") !== "0";

  const html = renderClientLetterHtml({
    letterhead,
    title: letter.title,
    body: letter.body,
    clientName: client.name,
    autoPrint,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
