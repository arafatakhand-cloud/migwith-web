import { RoomsList } from "./RoomsList";

// /rooms: every chat room on one page (the Lobby shows the top 5 of each list, the rest under ⌄).
export default function RoomsPage() {
  return <RoomsList full />;
}
