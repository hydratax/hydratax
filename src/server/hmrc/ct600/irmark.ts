import { createHash } from "crypto";
import { DOMParser, XMLSerializer, type Element as XmlElement } from "@xmldom/xmldom";
import { C14nCanonicalization } from "xml-crypto";
import { CT_NS } from "@/server/hmrc/ct600/ct-xml";

const GOVTALK_NS = "http://www.govtalk.gov.uk/CM/envelope";

function isIrmarkElement(el: XmlElement): boolean {
  const name = el.localName || el.nodeName.replace(/^[^:]+:/, "");
  return name === "IRmark";
}

/** Remove IRmark nodes; surrounding text nodes (whitespace) are preserved. */
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

function bodyWithCtNamespaces(): XmlElement {
  const doc = new DOMParser().parseFromString(
    `<Body xmlns="${GOVTALK_NS}" xmlns:ct="${CT_NS}"></Body>`,
    "text/xml",
  );
  const body = doc.documentElement;
  if (!body || body.nodeName === "parsererror") {
    throw new Error("IRmark: failed to prepare canonical Body wrapper");
  }
  return body;
}

/**
 * HMRC Generic IRmark — matches cybermaggedon/ct600 (proven CT filer):
 * extract Body, remove IRmark, serialize, re-hoist ct namespace, inclusive C14N, SHA-1, Base64.
 */
export function computeIrmark(bodyInnerXml: string): string {
  const wrapped = `<Body xmlns="${GOVTALK_NS}" xmlns:ct="${CT_NS}">${bodyInnerXml}</Body>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/xml");
  const body = doc.documentElement;
  if (!body || body.nodeName === "parsererror") {
    throw new Error("IRmark: could not parse CT600 body XML");
  }

  removeIrmarkNodes(body);

  const serialized = new XMLSerializer().serializeToString(body);
  const reparsed = new DOMParser().parseFromString(serialized, "text/xml");
  const source = reparsed.documentElement;
  if (!source || source.nodeName === "parsererror") {
    throw new Error("IRmark: could not re-parse CT600 body XML");
  }

  const hoisted = bodyWithCtNamespaces();
  const hoistDoc = hoisted.ownerDocument!;
  for (let i = 0; i < source.childNodes.length; i++) {
    hoisted.appendChild(hoistDoc.importNode(source.childNodes[i], true));
  }

  const canonical = new C14nCanonicalization().process(
    hoisted as unknown as Element,
    {},
  );
  return createHash("sha1").update(canonical, "utf8").digest("base64");
}

export function injectIrmark(bodyInnerXml: string, mark: string): string {
  const markXml = `<ct:IRmark Type="generic">${mark}</ct:IRmark>`;
  if (/<(?:ct:)?IRmark\b/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(
      /<(?:ct:)?IRmark\b[^>]*>[\s\S]*?<\/(?:ct:)?IRmark>/i,
      markXml,
    );
  }
  if (/<(?:ct:)?Sender>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<(?:ct:)?Sender>/i, `${markXml}<ct:Sender>`);
  }
  if (/<\/(?:ct:)?DefaultCurrency>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(
      /<\/(?:ct:)?DefaultCurrency>/i,
      `</ct:DefaultCurrency>${markXml}`,
    );
  }
  if (/<\/(?:ct:)?IRheader>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<\/(?:ct:)?IRheader>/i, `${markXml}</ct:IRheader>`);
  }
  return bodyInnerXml.replace(/(<(?:ct:)?IRenvelope\b[^>]*>)/i, `$1${markXml}`);
}
