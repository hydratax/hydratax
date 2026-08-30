import { escapeXml } from "@/server/hmrc/ct600/xml-utils";

export type Ct600PrincipalContact = {
  title?: string;
  forename?: string;
  surname?: string;
  email?: string;
  telephone?: string;
};

/** Parse "SURNAME, Forename" or "Forename Surname" into IR header name parts. */
export function parseDeclarantName(raw: string | null | undefined): {
  forename: string;
  surname: string;
} {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { forename: "Director", surname: "Name" };
  }
  if (trimmed.includes(",")) {
    const [sur, fore] = trimmed.split(",", 2).map((s) => s.trim());
    return {
      forename: fore || "Director",
      surname: sur || "Name",
    };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { forename: parts[0], surname: "Director" };
  }
  return {
    forename: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1] ?? "Director",
  };
}

export function resolvePrincipalContact(opts: {
  declarantName?: string | null;
  contact?: Ct600PrincipalContact | null;
}): Required<
  Pick<Ct600PrincipalContact, "title" | "forename" | "surname" | "email" | "telephone">
> {
  const parsed = parseDeclarantName(opts.declarantName);
  const contact = opts.contact ?? {};
  return {
    title: contact.title?.trim() || "",
    forename: contact.forename?.trim() || parsed.forename,
    surname: contact.surname?.trim() || parsed.surname,
    email: contact.email?.trim() || "contact@example.com",
    telephone: contact.telephone?.replace(/\s+/g, "") || "00000000000",
  };
}

export function principalContactXml(contact: ReturnType<typeof resolvePrincipalContact>): string {
  return `<Principal>
        <Contact>
          <Name>
            <Ttl>${escapeXml(contact.title)}</Ttl>
            <Fore>${escapeXml(contact.forename)}</Fore>
            <Sur>${escapeXml(contact.surname)}</Sur>
          </Name>
          <Email>${escapeXml(contact.email)}</Email>
          <Telephone><Number>${escapeXml(contact.telephone)}</Number></Telephone>
        </Contact>
      </Principal>`;
}
