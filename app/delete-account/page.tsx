import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "../_components/LegalPage";
import { SelfDeleteButton } from "./_SelfDelete";

export const metadata: Metadata = {
  title: "Delete your account — miGlife",
  description: "How to request deletion of your miGlife account and what is deleted.",
};

const SUBJECT = "Delete my account";
const BODY = "Hello miGlife team,\n\nPlease delete my miGlife account and all my personal data.\n\nMIG ID: [your MIG ID]\n\nThank you.";
const MAILTO = `mailto:support@miglife.app?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your miGlife account">
      <p>This page explains how to permanently delete your miGlife account and the personal data that comes with it.</p>

      <H2>Delete it yourself (fastest)</H2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Log in to miGlife (in the app: <b>Settings → Account → Delete account</b> brings you here).</li>
        <li>Tap <b>🗑 Delete my account</b> below.</li>
        <li>Type <b>DELETE</b> and confirm. Your account is deleted <b>7 days</b> later.</li>
      </ol>
      <SelfDeleteButton />

      <H2>Or ask us by email</H2>
      <p>Can&apos;t log in any more? Send us an email instead:</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          Send an email to{" "}
          <a className="font-semibold text-[#2F80ED] underline" href={MAILTO}>support@miglife.app</a> with the subject{" "}
          <b>“Delete my account”</b>. If you added a recovery email to your account, send it from that address.
        </li>
        <li>Write your <b>MIG ID</b> (username) in the email, so we can find your account.</li>
        <li>We reply to confirm, and your account is deleted <b>7 days</b> later.</li>
      </ol>
      <a href={MAILTO} className="inline-block rounded-xl bg-[#E5541A] px-5 py-3 font-bold text-white shadow-sm">
        ✉️ Send deletion request
      </a>
      <pre className="whitespace-pre-wrap rounded-2xl bg-[#0B2A5B] p-4 text-[13px] leading-5 text-[#DCE8FA]">
        {`Subject: ${SUBJECT}\n\n${BODY}`}
      </pre>

      <H2>Good to know</H2>
      <List
        items={[
          "Changed your mind? Just log in again within those 7 days — the deletion is cancelled.",
          "Coins left on the account are lost — they can't be moved or brought back after the deletion.",
          "You are logged out everywhere once the deletion is scheduled.",
        ]}
      />

      <H2>What is deleted</H2>
      <List
        items={[
          "Your profile: MIG ID, photos, name, details, bio and status.",
          "Your login, recovery email, Security PIN and security answer.",
          "Friends and friend requests, mail, alerts, and mentor / merchant tags.",
          "Your coin and XP history, badges, styles and game items.",
          "Your IP address and device records.",
        ]}
      />

      <H2>What stays</H2>
      <List
        items={[
          "Messages you posted in chat rooms and private chats — with the photos, voice messages and files in them — stay for the other people, shown as “Deleted user” (no name, no photo).",
          "Mail you sent stays in the other person's mailbox, shown as from “Deleted user”.",
          "Records that belong to other people — for example a gift or coins they received from you — stay in their history without your name.",
          "Reports you sent or that were made about you, and ban records (IP address or device bans), are kept as long as needed to keep miGlife safe.",
          "A short note that the account was deleted (its account number and the date), so a deletion is not done twice.",
        ]}
      />

      <H2>Before you go</H2>
      <List
        items={[
          <><b>Just need a break?</b> Log out — everything stays as it is for when you come back.</>,
          <><b>Too many notifications?</b> Turn them off in your phone or browser settings.</>,
          <><b>Someone bothering you?</b> Block them (Settings → Privacy → Blocked Users) or lock your profile.</>,
          <><b>Worried about your data?</b> Read our <Link className="font-semibold text-[#2F80ED] underline" href="/privacy">Privacy Policy</Link>.</>,
        ]}
      />
    </LegalPage>
  );
}
