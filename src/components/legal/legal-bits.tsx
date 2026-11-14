import Link from "next/link";
import { isTodoValue } from "@/lib/legal-entity";
import {
  LAWFUL_BASIS_LABEL,
  RETENTION_POLICY,
  type RetentionRole,
} from "@/lib/retention-policy";
import { SUBPROCESSORS } from "@/lib/subprocessors";

/**
 * Renders an owner-supplied fact. Unfilled TODO placeholders are highlighted
 * so they cannot be mistaken for real information.
 */
export function Fact({ value }: { value: string }) {
  // TODO markers may be embedded mid-sentence, so split and highlight each.
  const parts = value.split(/(\[TODO[^\]]*\])/g);
  return (
    <>
      {parts.map((part, i) =>
        isTodoValue(part) ? (
          <mark
            key={i}
            className="rounded bg-amber-100 px-1 font-mono text-[0.8em] text-amber-900"
            data-legal-todo
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const external = /^https?:/.test(href);
  if (external) {
    return (
      <a
        href={href}
        className="font-semibold text-sea"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className="font-semibold text-sea">
      {children}
    </Link>
  );
}

export function RetentionTable({ role }: { role: RetentionRole }) {
  const rows = RETENTION_POLICY.filter((c) => c.role === role);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-line text-ink">
            <th className="py-2 pr-3 font-semibold">Data</th>
            <th className="py-2 pr-3 font-semibold">Purpose</th>
            <th className="py-2 pr-3 font-semibold">Lawful basis</th>
            <th className="py-2 font-semibold">Retention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-line/70 align-top">
              <td className="py-2 pr-3">
                <span className="font-medium text-ink">{c.label}</span>
                <br />
                <span className="text-ink-soft">{c.dataTypes.join(", ")}</span>
              </td>
              <td className="py-2 pr-3">{c.purpose}</td>
              <td className="py-2 pr-3">
                {c.lawfulBasis.map((b) => LAWFUL_BASIS_LABEL[b]).join("; ")}
              </td>
              <td className="py-2">
                {c.retention.description}
                {c.sourceUrls.length > 0 ? (
                  <>
                    {" "}
                    {c.sourceUrls.map((u, i) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sea underline"
                      >
                        [source{c.sourceUrls.length > 1 ? ` ${i + 1}` : ""}]
                      </a>
                    ))}
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SubProcessorTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-line text-ink">
            <th className="py-2 pr-3 font-semibold">Provider</th>
            <th className="py-2 pr-3 font-semibold">What it does for us</th>
            <th className="py-2 pr-3 font-semibold">Data</th>
            <th className="py-2 pr-3 font-semibold">Location</th>
            <th className="py-2 font-semibold">Transfer safeguard</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name} className="border-b border-line/70 align-top">
              <td className="py-2 pr-3 font-medium text-ink">
                {s.name}
                {s.status === "optional" ? (
                  <span className="block font-normal text-ink-soft">
                    only if enabled
                  </span>
                ) : null}
                {s.vendorRole === "independent_controller" ? (
                  <span className="block font-normal text-ink-soft">
                    independent controller for its own purposes
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-3">{s.role}</td>
              <td className="py-2 pr-3">{s.data}</td>
              <td className="py-2 pr-3">
                <Fact value={s.location} />
              </td>
              <td className="py-2">
                <Fact value={s.transfer} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
