import { createHash } from "crypto";
import { DOMParser, XMLSerializer, type Element as XmlElement } from "@xmldom/xmldom";
import { C14nCanonicalization } from "xml-crypto";

const GOVTALK_NS = "http://www.govtalk.gov.uk/CM/envelope";

function isIrmarkElement(el: XmlElement): boolean {
  const name = el.localName || el.nodeName.replace(/^[^:]+:/, "");
  return name === "IRmark";
}

function removeIrmarkNodes(root: XmlElement) {
  const toRemove: XmlElement[] = [];
  const visit = (node: XmlElement) => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType !== 1) continue;
      const el = child as XmlElement;
      if (isIrmarkElement(el)) toRemove.push(el);
      else visit(el);
    }
  };
  visit(root);
  for (const el of toRemove) {
    el.parentNode?.removeChild(el);
  }
}

/**
 * Generic IRmark for PAYE RTI (FPS/EPS) — no Corporation Tax `ct:` namespace.
 */
export function computeRtiIrmark(bodyInnerXml: string): string {
  const wrapped = `<Body xmlns="${GOVTALK_NS}">${bodyInnerXml}</Body>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/xml");
  const body = doc.documentElement;
  if (!body || body.nodeName === "parsererror") {
    throw new Error("IRmark: could not parse RTI body XML");
  }
  removeIrmarkNodes(body);

  const serialized = new XMLSerializer().serializeToString(body);
  const reparsed = new DOMParser().parseFromString(serialized, "text/xml");
  const source = reparsed.documentElement;
  if (!source || source.nodeName === "parsererror") {
    throw new Error("IRmark: could not re-parse RTI body XML");
  }

  const shellDoc = new DOMParser().parseFromString(
    `<Body xmlns="${GOVTALK_NS}"></Body>`,
    "text/xml",
  );
  const hoisted = shellDoc.documentElement!;
  for (let i = 0; i < source.childNodes.length; i++) {
    hoisted.appendChild(shellDoc.importNode(source.childNodes[i]!, true));
  }

  const canonical = new C14nCanonicalization().process(
    hoisted as unknown as Element,
    {},
  );
  return createHash("sha1").update(canonical, "utf8").digest("base64");
}

/** Insert unprefixed IRmark into IRheader (before Sender). */
export function injectRtiIrmark(bodyInnerXml: string, mark: string): string {
  const markXml = `<IRmark Type="generic">${mark}</IRmark>`;
  if (/<(?:ct:)?IRmark\b/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(
      /<(?:ct:)?IRmark\b[^>]*>[\s\S]*?<\/(?:ct:)?IRmark>/i,
      markXml,
    );
  }
  if (/<Sender>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<Sender>/i, `${markXml}<Sender>`);
  }
  if (/<\/DefaultCurrency>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(
      /<\/DefaultCurrency>/i,
      `</DefaultCurrency>${markXml}`,
    );
  }
  if (/<\/IRheader>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<\/IRheader>/i, `${markXml}</IRheader>`);
  }
  return bodyInnerXml.replace(/(<IRenvelope\b[^>]*>)/i, `$1${markXml}`);
}
