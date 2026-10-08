"use client";

import { useEffect } from "react";
import { brandMiglife } from "../../lib/brand";

// Like the app, "miglife" is SHOWN as "miGlife" in every piece of text on every
// page (names, lists, profiles, chats, settings). Display only: the same-length
// swap touches text nodes, never input values or links, so logins, founder
// checks and web.miglife.app keep working. A text node React changes later is
// fixed again by the observer.

function skip(el: Element | null): boolean {
  return !!el?.closest("script, style, textarea, input, [contenteditable='true']");
}

function fix(node: Text) {
  const raw = node.nodeValue;
  if (!raw || !/miglife/i.test(raw) || skip(node.parentElement)) return;
  const shown = brandMiglife(raw);
  if (shown !== raw) node.nodeValue = shown;
}

function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return fix(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null = tw.nextNode();
  while (n) {
    fix(n as Text);
    n = tw.nextNode();
  }
}

export function BrandName() {
  useEffect(() => {
    walk(document.body);
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "characterData") fix(r.target as Text);
        else r.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
