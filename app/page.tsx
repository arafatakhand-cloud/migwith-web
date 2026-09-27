import { HomeGate } from "./_components/HomeGate";

/* "/" opens like the app: the splash, then the home screen when signed in or
   the login screen when not. The old landing page lives at /welcome. */
export default function Home() {
  return <HomeGate />;
}
