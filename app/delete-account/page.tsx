import type { Metadata } from "next";
import Link from "next/link";
import { H2, LegalPage, List } from "../_components/LegalPage";
import { DeletionNotice } from "./DeletionNotice";

export const metadata: Metadata = {
  title: "Delete your account — miGlife",
  description: "How to delete your miGlife account and what is deleted.",
};

export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your miGlife account">
      <DeletionNotice />
      <p>You can delete your miGlife account yourself, at any time — in the app or on the web.</p>

      <H2>How to delete</H2>
      <List
        items={[
          <><b>In the app:</b> Settings → Account → <b>Delete my account</b>, then type DELETE to confirm.</>,
          <>
            <b>On the web:</b> <Link className="font-semibold text-[#2F80ED] underline" href="/login">log in</Link> at web.miglife.app → Settings →
            Account → <b>Delete my account</b>.
          </>,
          <>
            <b>Can&apos;t log in?</b> Email{" "}
            <a className="font-semibold text-[#2F80ED] underline" href="mailto:support@miglife.app?subject=Delete%20my%20account">support@miglife.app</a>{" "}
            from your recovery email with the subject “Delete my account” and your MIG ID.
          </>,
        ]}
      />

      <H2>What happens</H2>
      <List
        items={[
          "You are logged out everywhere.",
          "Your account is deleted after 7 days. Changed your mind? Just log in again within those 7 days — the deletion is cancelled.",
          "An account that still has coins can't be deleted: spend or transfer the coins first.",
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

      <p>
        More in our <Link className="font-semibold text-[#2F80ED] underline" href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
