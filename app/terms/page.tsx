import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Community Rules — miGlife",
  description: "The rules for using miGlife: who can join, what is not allowed in chats, how reporting and blocking work, and how virtual coins work.",
};

// Terms of Service + Community Rules (Google Play's user-generated-content
// rule: users agree to these before they can chat). Keep them TRUE to what the
// app, the web and the server really do.
export default function TermsPage() {
  return (
    <LegalPage title="Terms & Community Rules" updated="14 October 2026">
      <p>
        These terms apply to the miGlife Android app and the website web.miglife.app. By creating a MIG ID or using miGlife you
        agree to them and to our <Link className="font-semibold text-[#2F80ED] underline" href="/privacy">Privacy Policy</Link>.
        Questions: <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app">support@miglife.app</a>.
      </p>

      <H2>1. Who can use miGlife</H2>
      <List
        items={[
          "You must be 18 years or older.",
          "One person, one account. Making many accounts to cheat, spam or get around a ban is not allowed.",
          "You are responsible for your account. Never share your password or Security PIN — the miGlife team will never ask for them.",
        ]}
      />

      <H2>2. Community rules — zero tolerance</H2>
      <p>These are not allowed anywhere in miGlife — in chat rooms, private chats, mail, photos, voice messages, profiles, status messages or room names:</p>
      <List
        items={[
          "Harassment, bullying, threats, or encouraging anyone to hurt themselves or others.",
          "Hate speech or attacks on people because of religion, race, ethnicity, nationality, caste, gender, sexual orientation or disability.",
          "Sexual or nude content, and any sexual content involving minors (reported to the authorities).",
          "Violent or shocking content, terrorism or extremist content.",
          "Scams, fraud, phishing, asking for passwords, PINs or money.",
          "Buying, selling or trading miGlife coins or accounts for real money or anything outside miGlife.",
          "Spam, flooding, advertising or links to harmful sites.",
          "Pretending to be someone else, including the miGlife team.",
          "Sharing other people's private information or photos without their permission.",
          "Anything illegal, including illegal drugs and weapons.",
        ]}
      />

      <H2>3. Reporting and blocking</H2>
      <List
        items={[
          <><b>Report:</b> long-press a room message or a private message and tap 🚩 Report, or open a profile and tap 🚩 Report. Reports are private — the person does not see who reported them.</>,
          <><b>Block:</b> open a profile or a private chat and tap 🚫 Block. You will no longer see their room messages, their private messages or their notifications. You can unblock them any time in Settings → Blocked users.</>,
          <>The miGlife team reviews reports, usually within 24 hours, and can remove content, mute, kick or ban from rooms, and suspend or delete accounts. Serious cases may be reported to the authorities.</>,
          <>You can also write to <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app">support@miglife.app</a> or use Settings → Help &amp; Support.</>,
        ]}
      />

      <H2>4. Room owners and moderators</H2>
      <p>
        Room owners and moderators help keep their rooms safe (mute, kick, ban). They must follow these rules too and must not
        misuse their tools. The miGlife team can remove a moderator or a room that breaks the rules.
      </p>

      <H2>5. Virtual coins, gifts and games</H2>
      <List
        items={[
          "miGlife coins are virtual items for fun inside miGlife only. They have no real-money value.",
          "Coins cannot be bought with real money in miGlife and can never be exchanged for money, prizes or anything outside miGlife.",
          "The games (Ludo, Teen Patti, Luxury Bot, LowCard, Cricket and others) are played only with these virtual coins. There is no real-money gambling and nothing real can be won.",
          "Selling or buying coins, gifts or accounts outside miGlife is forbidden; accounts that do it can lose their coins or be banned.",
          "Coins, gifts and XP can be changed, reset or removed, for example after cheating or a bug.",
        ]}
      />

      <H2>6. Your content</H2>
      <p>
        You own what you post, and you let miGlife store and show it to the people you send it to so the service works. Do not
        post anything you do not have the right to share. We may remove any content that breaks these rules.
      </p>

      <H2>7. Ending your account</H2>
      <p>
        You can ask to delete your account any time — see <Link className="font-semibold text-[#2F80ED] underline" href="/delete-account">Delete your account</Link>.
        We may suspend or delete accounts that break these terms.
      </p>

      <H2>8. Changes</H2>
      <p>We may update these terms. The date at the top shows the latest version; using miGlife after a change means you accept it.</p>
    </LegalPage>
  );
}
