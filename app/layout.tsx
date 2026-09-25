import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pretext — AI sparring partner for frontline staff",
  description:
    "An AssemblyAI voice agent plays the caller — angry customer, confused elder, social engineer. You play the employee. Live rubric scoring, BREACH / HELD THE LINE verdict, coach debrief.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
