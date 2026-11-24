import ForceLight from "../_components/ForceLight";

// ☀️ The Feed (and a post, and writing a post) always look like Light mode.
export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLight />
      {children}
    </>
  );
}
