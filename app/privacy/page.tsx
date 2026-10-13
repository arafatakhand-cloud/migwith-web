import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "../_components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — miGlife",
  description: "What miGlife collects, why, who it is shared with, and how to delete your account.",
};

// Keep this page TRUE to what the app, the web and the server really do
// (functions/index.js, the Android app). Update it whenever that changes.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="14 October 2026">
      <p>
        This policy explains what information miGlife (the Android app and the website web.miglife.app) collects, why we use
        it, who it is shared with, and how you can delete it. Questions:{" "}
        <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app">support@miglife.app</a>.
      </p>

      <H2>1. Information we collect</H2>
      <List
        items={[
          <><b>Account:</b> your MIG ID (username) and password. The password is handled by Google Firebase Authentication — we never see it. Your recovery email, if you add one. Your Security PIN and security-question answer are stored only as secure hashes.</>,
          <><b>Profile (what you choose to add):</b> profile and cover photo, full name, gender, date of birth, country, relationship status, bio and status message.</>,
          <><b>Your content:</b> messages in chat rooms and private chats, photos and voice messages you send, mail, gifts, reactions and votes.</>,
          <><b>Coins and activity:</b> coin balance and coin history (transfers, gifts, bets and winnings in the in-app games), XP, level, badges and achievements. Coins are virtual and are used only inside miGlife.</>,
          <><b>Device and technical data:</b> your IP address and the approximate location worked out from it (country, region, city, internet provider); on Android, an identifier of your phone that we store only in hashed form; your push-notification token; when you were last online.</>,
        ]}
      />

      <H2>2. How we use it</H2>
      <List
        items={[
          "To run miGlife: your account, chat rooms, friends, private chat, gifts, coins, games, levels and leaderboards.",
          "To keep miGlife safe: detecting several accounts on one phone or IP address, stopping cheating, spam and abuse, and banning accounts that break the rules.",
          "To send you notifications (messages, friend requests, gifts) and the codes you ask for (email verification, password / PIN recovery).",
          "To answer you when you contact support.",
        ]}
      />
      <p>We do not sell your personal data and we do not use it for advertising.</p>

      <H2>3. Who it is shared with</H2>
      <p>We use these services to run miGlife. They receive only what they need:</p>
      <List
        items={[
          <><b>Google Firebase / Google Cloud</b> — sign-in, the database, file storage (photos, voice messages), server functions and push notifications. All the data above is stored and processed there.</>,
          <><b>ipwho.is</b> — your IP address is sent to it to look up the approximate location and internet provider (used for security, see above).</>,
          <><b>Google Gmail</b> — sends the verification and recovery codes to your email address.</>,
          <><b>Vercel</b> — hosts the website; like any website host it receives normal request data such as your IP address.</>,
          <><b>Google reCAPTCHA</b> — may check, on the website, that requests come from a real browser.</>,
          <><b>YouTube</b> — only if you play a YouTube link in a chat, the video is loaded from YouTube.</>,
        ]}
      />
      <p>We may also share information if the law requires it.</p>

      <H2>4. What other users can see</H2>
      <p>
        Your MIG ID, profile (unless you lock it), level, badges, online status, and the messages you post in chat rooms are
        visible to other users. Private chats and mail are visible only to you and the other person.
      </p>

      <H2>5. Security</H2>
      <p>
        All data travels over encrypted connections (HTTPS / TLS). Access to the database is limited by security rules, and
        coins move only through our server. PINs and security answers are stored as hashes.
      </p>

      <H2>6. How long we keep it, and deleting your account</H2>
      <p>
        We keep your data while your account exists. You can ask us to delete your account at any time by email
        (support@miglife.app, subject “Delete my account”, with your MIG ID). It is deleted 7 days later — logging in again
        within those 7 days cancels it. Your profile, photos, friends, mail, alerts, tags, coin history, IP records and login are deleted; your old chat
        messages stay, shown as “Deleted user”. Records that belong to other people (for example a gift they received from
        you) stay in their history without your name.{" "}
        <Link className="font-semibold text-[#2F80ED] underline" href="/delete-account">How to delete your account</Link>.
      </p>

      <H2>7. Your choices</H2>
      <List
        items={[
          "Edit or remove your profile details and photos at any time.",
          "Lock your profile, turn off email from other users, and block people (Settings → Privacy).",
          "Turn off notifications in your phone or browser settings.",
          "Delete your account (see above).",
        ]}
      />

      <H2>8. Children</H2>
      <p>miGlife is not meant for children under 13. If you believe a child under 13 has an account, contact us and we will delete it.</p>

      <H2>9. Changes</H2>
      <p>If this policy changes, we will update this page and the date at the top.</p>

      <H2>10. Contact</H2>
      <p>
        <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app">support@miglife.app</a>
      </p>
    </LegalPage>
  );
}
