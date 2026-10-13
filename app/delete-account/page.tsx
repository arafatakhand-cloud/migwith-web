import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "../_components/LegalPage";

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

      <H2>How to request deletion</H2>
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
          "An account that still has coins can't be deleted: spend or transfer the coins first.",
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
          "Messages you posted in chat rooms and private chats stay for the other people, shown as “Deleted user” (no name, no photo).",
          "Records that belong to other people — for example a gift or coins they received from you — stay in their history without your name.",
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
