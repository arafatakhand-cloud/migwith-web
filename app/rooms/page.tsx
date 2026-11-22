import { redirect } from "next/navigation";

// The separate Chat Rooms page is gone: the room list lives on the Lobby.
export default function RoomsPage() {
  redirect("/");
}
