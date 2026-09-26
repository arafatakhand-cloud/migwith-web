"use client";

import { useEffect } from "react";
import { getLang, translate } from "../../lib/i18n";

// When Bangla is chosen, replace any text node (or placeholder / title /
// aria-label) whose whole trimmed text is in the dictionary. A text node React
// later changes is translated again by the observer. Chat messages and names
// sit inside [data-notranslate] and are never touched.

const ATTRS = ["placeholder", "title", "aria-label"];

function skip(el: Element | null): boolean {
  return !!el?.closest("[data-notranslate], script, style, textarea, code, pre");
}

function translateText(node: Text) {
  const raw = node.nodeValue;
  if (!raw || !/[A-Za-z]/.test(raw) || skip(node.parentElement)) return;
  const bn = translate(raw.replace(/\s+/g, " ").trim());
  if (bn === null) return;
  const lead = raw.match(/^\s*/)?.[0] ?? "";
  const tail = raw.match(/\s*$/)?.[0] ?? "";
  node.nodeValue = lead + bn + tail;
}

function translateAttrs(el: Element) {
  if (skip(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v || !/[A-Za-z]/.test(v)) continue;
    const bn = translate(v.trim());
    if (bn !== null) el.setAttribute(a, bn);
  }
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skip(el)) return;
  translateAttrs(el);
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n: Node | null = tw.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n as Text);
    else translateAttrs(n as Element);
    n = tw.nextNode();
  }
}

export function Translator() {
  useEffect(() => {
    const lang = getLang();
    document.documentElement.lang = lang;
    if (lang !== "bn") return;

    walk(document.body);
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") translateText(r.target as Text);
        else if (r.type === "attributes") translateAttrs(r.target as Element);
        else r.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
    return () => obs.disconnect();
  }, []);
  return null;
}
