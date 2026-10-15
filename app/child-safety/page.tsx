import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Child Safety Standards — miGlife",
  description: "miGlife's standards against child sexual abuse and exploitation (CSAE), how to report it, and who to contact.",
};

// Child safety standards (Google Play's policy for social apps). Keep them TRUE
// to what the app, the web and the server really do.
export default function ChildSafetyPage() {
  return (
    <LegalPage title="Child Safety Standards" updated="15 October 2026">
      <p>
        These standards apply to the miGlife Android app and the website web.miglife.app. miGlife has <b>zero tolerance</b> for
        child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM).
      </p>

      <H2>1. miGlife is for adults only</H2>
      <List
        items={[
          "You must be 18 years or older to create a MIG ID or use miGlife.",
          "Accounts that belong to someone under 18 are deleted when we find them.",
        ]}
      />

      <H2>2. What is never allowed</H2>
      <List
        items={[
          "Any sexual content involving a minor, including photos, videos, voice messages, drawings or text.",
          "Grooming: contacting, befriending or pressuring a minor for sexual purposes.",
          "Sexual extortion (sextortion), or asking anyone under 18 for sexual images.",
          "Sharing, asking for, or linking to child sexual abuse material.",
          "Any other content or behaviour that sexualises, exploits or endangers children.",
        ]}
      />

      <H2>3. How to report</H2>
      <List
        items={[
          <><b>In the app or on the website:</b> long-press a room message or a private message and tap 🚩 Report, or open a profile and tap 🚩 Report. Reports are private — the person does not see who reported them.</>,
          <><b>By email:</b> write to <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app">support@miglife.app</a> with the MIG ID of the account and what happened. Please do not attach or forward abusive images.</>,
          "If a child is in immediate danger, contact your local police first.",
        ]}
      />

      <H2>4. What we do</H2>
      <List
        items={[
          "The miGlife team reviews every child-safety report as a priority.",
          "We remove the content and permanently ban the accounts involved, including bans by device and IP address so they cannot simply come back.",
          "We report child sexual abuse material and child exploitation to the relevant authorities, as the law requires, and we keep the evidence they need.",
          "We cooperate with law enforcement requests about child safety.",
        ]}
      />

      <H2>5. Following the law</H2>
      <p>
        miGlife follows the child-safety laws that apply to it, including the laws of Bangladesh, and Google Play&apos;s Child
        Safety Standards policy.
      </p>

      <H2>6. Child safety contact</H2>
      <p>
        Our point of contact for child-safety questions, including from authorities and Google Play, is the miGlife team at{" "}
        <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app">support@miglife.app</a>.
      </p>

      <p>
        See also our <Link className="font-semibold text-[#2F80ED] underline" href="/terms">Terms &amp; Community Rules</Link> and{" "}
        <Link className="font-semibold text-[#2F80ED] underline" href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
